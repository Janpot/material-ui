import childProcess from 'child_process';
import glob from 'fast-glob';
import path from 'path';
import { promisify } from 'util';
import yargs from 'yargs';
import * as url from 'url';
import { rollup } from 'rollup';
import { babel as rollupBabel } from '@rollup/plugin-babel';
import rollupResolve from '@rollup/plugin-node-resolve';
import rollupPreserveDirectives from 'rollup-plugin-preserve-directives';
import rollupAlias from '@rollup/plugin-alias';
import * as fs from 'fs/promises';
import { getVersionEnvVariables, getWorkspaceRoot } from './utils.mjs';

const exec = promisify(childProcess.exec);

const validBundles = [
  // modern build with a rolling target using ES6 modules
  'modern',
  // build for node using commonJS modules
  'node',
  // build with a hardcoded target using ES6 modules
  'stable',
];

async function run(argv) {
  const { bundle, largeFiles, outDir: relativeOutDir, verbose } = argv;

  if (!validBundles.includes(bundle)) {
    throw new TypeError(
      `Unrecognized bundle '${bundle}'. Did you mean one of "${validBundles.join('", "')}"?`,
    );
  }

  const packageJsonPath = path.resolve('./package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, { encoding: 'utf8' }));

  const babelRuntimeVersion = packageJson.dependencies['@babel/runtime'];
  if (!babelRuntimeVersion) {
    throw new Error(
      'package.json needs to have a dependency on `@babel/runtime` when building with `@babel/plugin-transform-runtime`.',
    );
  }

  const env = {
    NODE_ENV: 'production',
    BABEL_ENV: bundle,
    MUI_BUILD_VERBOSE: verbose,
    MUI_BABEL_RUNTIME_VERSION: babelRuntimeVersion,
    ...(await getVersionEnvVariables()),
  };

  const babelConfigPath = path.resolve(getWorkspaceRoot(), 'babel.config.js');
  const srcDir = path.resolve('./src');
  const extensions = ['.js', '.ts', '.tsx'];
  const ignore = [
    '**/*.test.js',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.d.ts',
  ];

  const topLevelNonIndexFiles = glob
    .sync(`*{${extensions.join(',')}}`, { cwd: srcDir, ignore })
    .filter((file) => {
      return path.basename(file, path.extname(file)) !== 'index';
    });
  const topLevelPathImportsCanBePackages = topLevelNonIndexFiles.length === 0;

  const outDir = path.resolve(
    relativeOutDir,
    // We generally support top level path imports e.g.
    // 1. `import ArrowDownIcon from '@mui/icons-material/ArrowDown'`.
    // 2. `import Typography from '@mui/material/Typography'`.
    // The first case resolves to a file while the second case resolves to a package first i.e. a package.json
    // This means that only in the second case the bundler can decide whether it uses ES modules or CommonJS modules.
    // Different extensions are not viable yet since they require additional bundler config for users and additional transpilation steps in our repo.
    //
    // TODO v6: Switch to `exports` field.
    {
      node: topLevelPathImportsCanBePackages ? './node' : './',
      modern: './modern',
      stable: topLevelPathImportsCanBePackages ? './' : './esm',
    }[bundle],
  );

  if (argv.rollup) {
    const entryFiles = await glob(`**/*{${extensions.join(',')}}`, { cwd: srcDir, ignore });

    const entries = Object.fromEntries(
      entryFiles.map((file) => [
        // nested/foo.js becomes nested/foo
        file.slice(0, file.length - path.extname(file).length),
        // This expands the relative paths to absolute paths, so e.g.
        // src/nested/foo becomes /project/src/nested/foo.js
        url.fileURLToPath(new URL(file, `${url.pathToFileURL(srcDir)}/`)),
      ]),
    );

    const rollupBundle = await rollup({
      input: entries,
      external: (id) => /node_modules/.test(id),
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') {
          warn(warning);
        }
      },
      plugins: [
        rollupAlias({
          // Mostly to resolve @mui/utils/formatMuiErrorMessage correctly, but generalizes to all packages.
          entries: [{ find: packageJson.name, replacement: srcDir }],
        }),
        rollupResolve({ extensions }),
        rollupBabel({
          configFile: babelConfigPath,
          extensions,
          babelHelpers: 'runtime',
          envName: 'rollup-stable',
        }),
        rollupPreserveDirectives(),
      ],
    });

    const targets = argv.target || [
      {
        node: 'cjs',
        modern: 'modern',
        stable: 'esm',
      }[bundle],
    ];

    await Promise.all(
      targets.map(async (target) => {
        const targetOutDir = path.resolve(
          relativeOutDir,
          // We generally support top level path imports e.g.
          // 1. `import ArrowDownIcon from '@mui/icons-material/ArrowDown'`.
          // 2. `import Typography from '@mui/material/Typography'`.
          // The first case resolves to a file while the second case resolves to a package first i.e. a package.json
          // This means that only in the second case the bundler can decide whether it uses ES modules or CommonJS modules.
          // Different extensions are not viable yet since they require additional bundler config for users and additional transpilation steps in our repo.
          //
          // TODO v6: Switch to `exports` field.
          {
            cjs: topLevelPathImportsCanBePackages ? './node' : './',
            modern: './modern',
            esm: topLevelPathImportsCanBePackages ? './' : './esm',
          }[target],
        );

        const outFileExtension = '.js';

        await rollupBundle.write({
          preserveModules: true,
          interop: (id) => {
            switch (id) {
              case 'clsx':
                return 'default';
              default:
                return 'esModule';
            }
          },
          exports: 'named',
          dir: targetOutDir,
          format: target === 'cjs' ? 'commonjs' : 'es',
          entryFileNames: `[name]${outFileExtension}`,
        });
      }),
    );

    return;
  }

  const babelArgs = [
    '--config-file',
    babelConfigPath,
    '--extensions',
    `"${extensions.join(',')}"`,
    srcDir,
    '--out-dir',
    outDir,
    '--ignore',
    // Need to put these patterns in quotes otherwise they might be evaluated by the used terminal.
    `"${ignore.join('","')}"`,
  ];

  if (largeFiles) {
    babelArgs.push('--compact false');
  }

  const command = ['pnpm babel', ...babelArgs].join(' ');

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(`running '${command}' with ${JSON.stringify(env)}`);
  }

  const { stderr, stdout } = await exec(command, { env: { ...process.env, ...env } });
  if (stderr) {
    throw new Error(`'${command}' failed with \n${stderr}`);
  }

  if (verbose) {
    // eslint-disable-next-line no-console
    console.log(stdout);
  }
}

yargs(process.argv.slice(2))
  .command({
    command: '$0 <bundle>',
    description: 'build package',
    builder: (command) => {
      return command
        .positional('bundle', {
          description: `Valid bundles: "${validBundles.join('" | "')}"`,
          type: 'string',
        })
        .option('largeFiles', {
          type: 'boolean',
          default: false,
          describe: 'Set to `true` if you know you are transpiling large files.',
        })
        .option('out-dir', { default: './build', type: 'string' })
        .option('rollup', {
          default: false,
          type: 'boolean',
          describe: '(Experiment) Use rollup to build the files.',
        })
        .option('target', {
          type: 'array',
          choices: ['cjs', 'esm', 'modern'],
          describe: 'Target environment.',
        })
        .option('verbose', { type: 'boolean' });
    },
    handler: run,
  })
  .help()
  .strict(true)
  .version(false)
  .parse();
