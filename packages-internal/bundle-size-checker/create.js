// @ts-check

import path from 'path';
import os from 'os';
import fse from 'fs-extra';
import yargs from 'yargs';
import Piscina from 'piscina';
import { loadConfig } from './configLoader.js';

const MAX_CONCURRENCY = Math.min(8, os.cpus().length);

const rootDir = process.cwd();

/**
 * creates size snapshot for every bundle that built with webpack
 */
async function getWebpackSizes(webpackEnvironment) {
  const worker = new Piscina({
    filename: new URL('./worker.js', import.meta.url).href,
    maxThreads: MAX_CONCURRENCY,
  });
  // Clean and recreate the build directory
  const buildDir = path.join(rootDir, 'build');
  await fse.emptyDir(buildDir);

  const config = await loadConfig(rootDir);

  if (
    !config ||
    !config.entrypoints ||
    !Array.isArray(config.entrypoints) ||
    config.entrypoints.length === 0
  ) {
    throw new Error(
      'No valid configuration found. Create a bundle-size-checker.config.js or bundle-size-checker.config.mjs file with entrypoints array.',
    );
  }

  const entries = config.entrypoints;
  const uniqueEntries = new Set(entries);

  const sizeArrays = await Promise.all(
    Array.from(uniqueEntries, (entry, index) =>
      worker.run({ entry, webpackEnvironment, index, total: uniqueEntries.size }),
    ),
  );

  return sizeArrays.flat();
}

async function run(argv) {
  const { analyze, accurateBundles, output } = argv;

  const snapshotDestPath = output ? path.resolve(output) : path.join(rootDir, 'size-snapshot.json');

  const bundleSizes = Object.fromEntries([
    ...(await getWebpackSizes({ analyze, accurateBundles })),
  ]);

  // Ensure output directory exists
  await fse.mkdirp(path.dirname(snapshotDestPath));
  await fse.writeJSON(snapshotDestPath, bundleSizes, { spaces: 2 });

  // eslint-disable-next-line no-console
  console.log(`Bundle size snapshot written to ${snapshotDestPath}`);
}

yargs(process.argv.slice(2))
  .command({
    command: '$0',
    description: 'Saves a size snapshot in size-snapshot.json',
    builder: (command) => {
      return command
        .option('analyze', {
          default: false,
          describe: 'Creates a webpack-bundle-analyzer report for each bundle.',
          type: 'boolean',
        })
        .option('accurateBundles', {
          default: false,
          describe: 'Displays used bundles accurately at the cost of more CPU cycles.',
          type: 'boolean',
        })
        .option('output', {
          alias: 'o',
          describe:
            'Path to output the size snapshot JSON file (defaults to size-snapshot.json in current directory).',
          type: 'string',
        });
    },
    handler: run,
  })
  .help()
  .strict(true)
  .version(false)
  .parse();
