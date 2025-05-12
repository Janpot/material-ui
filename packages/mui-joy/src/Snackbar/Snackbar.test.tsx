import * as React from 'react';
import { expect } from 'chai';
import { SinonFakeTimers, spy, useFakeTimers } from 'sinon';
import { createRenderer, fireEvent, act } from '@mui/internal-test-utils';
import Snackbar, { snackbarClasses as classes } from '@mui/joy/Snackbar';
import { ThemeProvider } from '@mui/joy/styles';
import describeConformance from '../../test/describeConformance';

describe('Joy <Snackbar />', () => {
  let timer: SinonFakeTimers | null = null;

  beforeEach(() => {
    timer = useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    timer?.restore();
  });

  const { render: clientRender } = createRenderer();

  /**
   * @type  {typeof plainRender extends (...args: infer T) => any ? T : never} args
   *
   * @remarks
   * This is for all intents and purposes the same as our client render method.
   * `plainRender` is already wrapped in act().
   * However, React has a bug that flushes effects in a portal synchronously.
   * We have to defer the effect manually like `useEffect` would so we have to flush the effect manually instead of relying on `act()`.
   * React bug: https://github.com/facebook/react/issues/20074
   */
  async function render(...args: [React.ReactElement<any>]) {
    const result = clientRender(...args);
    await act(async () => {
      await timer?.tickAsync(0);
    });
    return result;
  }

  describeConformance(
    <Snackbar open startDecorator="icon" endDecorator="icon">
      Hello World!
    </Snackbar>,
    () => ({
      render: clientRender,
      classes,
      ThemeProvider,
      muiName: 'JoySnackbar',
      refInstanceof: window.HTMLDivElement,
      testVariantProps: { variant: 'solid' },
      slots: {
        root: { expectedClassName: classes.root },
        startDecorator: { expectedClassName: classes.startDecorator },
        endDecorator: { expectedClassName: classes.endDecorator },
      },
      skip: ['propsSpread', 'componentsProp', 'classesRoot'],
    }),
  );

  describe('prop: onClose', () => {
    it('should be called when clicking away', async () => {
      const handleClose = spy();
      await render(
        <Snackbar open onClose={handleClose}>
          Message
        </Snackbar>,
      );

      const event = new window.Event('click', { bubbles: true, cancelable: true });
      await act(async () => {
        document.body.dispatchEvent(event);
      });

      expect(handleClose.callCount).to.equal(1);
      expect(handleClose.args[0]).to.deep.equal([event, 'clickaway']);
    });

    it('should be called when pressing Escape', async () => {
      const handleClose = spy();
      await render(
        <Snackbar open onClose={handleClose}>
          Message
        </Snackbar>,
      );

      expect(fireEvent.keyDown(document.body, { key: 'Escape' })).to.equal(true);
      expect(handleClose.callCount).to.equal(1);
      expect(handleClose.args[0][1]).to.equal('escapeKeyDown');
    });

    it('can limit which Snackbars are closed when pressing Escape', async () => {
      const handleCloseA = spy((event) => event.preventDefault());
      const handleCloseB = spy();
      await render(
        <React.Fragment>
          <Snackbar open onClose={handleCloseA}>
            Message A
          </Snackbar>
          <Snackbar open onClose={handleCloseB}>
            Message B
          </Snackbar>
        </React.Fragment>,
      );

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(handleCloseA.callCount).to.equal(1);
      expect(handleCloseB.callCount).to.equal(0);
    });
  });

  describe('prop: autoHideDuration', () => {
    it('should call onClose when the timer is done', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;
      const { setProps } = await render(
        <Snackbar open={false} onClose={handleClose} autoHideDuration={autoHideDuration}>
          Message
        </Snackbar>,
      );

      setProps({ open: true });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(1);
      expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
    });

    it('calls onClose at timeout even if the prop changes', async () => {
      const handleClose1 = spy();
      const handleClose2 = spy();
      const autoHideDuration = 2e3;
      const { setProps } = await render(
        <Snackbar open={false} onClose={handleClose1} autoHideDuration={autoHideDuration}>
          Message
        </Snackbar>,
      );

      setProps({ open: true });
      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });
      setProps({ open: true, onClose: handleClose2 });
      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });

      expect(handleClose1.callCount).to.equal(0);
      expect(handleClose2.callCount).to.equal(1);
    });

    it('should not call onClose when the autoHideDuration is reset', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;
      const { setProps } = await render(
        <Snackbar open={false} onClose={handleClose} autoHideDuration={autoHideDuration}>
          Message
        </Snackbar>,
      );

      setProps({ open: true });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });
      setProps({ autoHideDuration: undefined });
      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });

      expect(handleClose.callCount).to.equal(0);
    });

    it('should not call onClose if autoHideDuration is undefined', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;
      await render(
        <Snackbar open onClose={handleClose} autoHideDuration={undefined}>
          Message
        </Snackbar>,
      );

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(0);
    });

    it('should not call onClose if autoHideDuration is null', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;

      await render(
        <Snackbar open onClose={handleClose} autoHideDuration={null}>
          Message
        </Snackbar>,
      );

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(0);
    });

    it('should not call onClose when closed', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;

      const { setProps } = await render(
        <Snackbar open onClose={handleClose} autoHideDuration={autoHideDuration}>
          Message
        </Snackbar>,
      );

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });
      setProps({ open: false });
      await act(async () => {
        await timer?.tickAsync(autoHideDuration / 2);
      });

      expect(handleClose.callCount).to.equal(0);
    });
  });

  [
    {
      type: 'mouse',
      enter: (container: HTMLElement) => fireEvent.mouseEnter(container.querySelector('button')!),
      leave: (container: HTMLElement) => fireEvent.mouseLeave(container.querySelector('button')!),
    },
    {
      type: 'keyboard',
      enter: async (container: HTMLElement) => {
        await act(async () => container.querySelector('button')!.focus());
      },
      leave: async (container: HTMLElement) => {
        await act(async () => container.querySelector('button')!.blur());
      },
    },
  ].forEach((userInteraction) => {
    describe(`interacting with ${userInteraction.type}`, () => {
      it('should be able to interrupt the timer', async () => {
        const handleMouseEnter = spy();
        const handleMouseLeave = spy();
        const handleBlur = spy();
        const handleFocus = spy();
        const handleClose = spy();
        const autoHideDuration = 2e3;

        const { container } = await render(
          <Snackbar
            endDecorator={<button>undo</button>}
            open
            onBlur={handleBlur}
            onFocus={handleFocus}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClose={handleClose}
            autoHideDuration={autoHideDuration}
          >
            Message
          </Snackbar>,
        );

        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await await userInteraction.enter(container.querySelector('div')!);

        if (userInteraction.type === 'keyboard') {
          expect(handleFocus.callCount).to.equal(1);
        } else {
          expect(handleMouseEnter.callCount).to.equal(1);
        }

        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await await userInteraction.leave(container.querySelector('div')!);

        if (userInteraction.type === 'keyboard') {
          expect(handleBlur.callCount).to.equal(1);
        } else {
          expect(handleMouseLeave.callCount).to.equal(1);
        }
        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(2e3);
        });

        expect(handleClose.callCount).to.equal(1);
        expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
      });

      it('should not call onClose with not timeout after user interaction', async () => {
        const handleClose = spy();
        const autoHideDuration = 2e3;
        const resumeHideDuration = 3e3;

        const { container } = await render(
          <Snackbar
            endDecorator={<button>undo</button>}
            open
            onClose={handleClose}
            autoHideDuration={autoHideDuration}
            resumeHideDuration={resumeHideDuration}
          >
            Message
          </Snackbar>,
        );

        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await userInteraction.enter(container.querySelector('div')!);
        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await userInteraction.leave(container.querySelector('div')!);

        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(2e3);
        });

        expect(handleClose.callCount).to.equal(0);
      });

      it('should call onClose when timer done after user interaction', async () => {
        const handleClose = spy();
        const autoHideDuration = 2e3;
        const resumeHideDuration = 3e3;

        const { container } = await render(
          <Snackbar
            endDecorator={<button>undo</button>}
            open
            onClose={handleClose}
            autoHideDuration={autoHideDuration}
            resumeHideDuration={resumeHideDuration}
          >
            Message
          </Snackbar>,
        );

        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await userInteraction.enter(container.querySelector('div')!);
        await act(async () => {
          await timer?.tickAsync(autoHideDuration / 2);
        });
        await userInteraction.leave(container.querySelector('div')!);

        expect(handleClose.callCount).to.equal(0);

        await act(async () => {
          await timer?.tickAsync(resumeHideDuration);
        });

        expect(handleClose.callCount).to.equal(1);
        expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
      });

      it('should call onClose immediately after user interaction when 0', async () => {
        const handleClose = spy();
        const autoHideDuration = 6e3;
        const resumeHideDuration = 0;
        const { setProps, container } = await render(
          <Snackbar
            endDecorator={<button>undo</button>}
            open
            onClose={handleClose}
            autoHideDuration={autoHideDuration}
            resumeHideDuration={resumeHideDuration}
          >
            Message
          </Snackbar>,
        );

        setProps({ open: true });

        expect(handleClose.callCount).to.equal(0);

        await userInteraction.enter(container.querySelector('div')!);
        await act(async () => {
          await timer?.tickAsync(100);
        });
        await userInteraction.leave(container.querySelector('div')!);
        await act(async () => {
          await timer?.tickAsync(resumeHideDuration);
        });

        expect(handleClose.callCount).to.equal(1);
        expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
      });
    });
  });

  describe('prop: disableWindowBlurListener', () => {
    it('should pause auto hide when not disabled and window lost focus', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;
      await render(
        <Snackbar
          open
          onClose={handleClose}
          autoHideDuration={autoHideDuration}
          disableWindowBlurListener={false}
        >
          Message
        </Snackbar>,
      );

      await act(async () => {
        const bEvent = new window.Event('blur', {
          bubbles: false,
          cancelable: false,
        });
        window.dispatchEvent(bEvent);
      });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        const fEvent = new window.Event('focus', {
          bubbles: false,
          cancelable: false,
        });
        window.dispatchEvent(fEvent);
      });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(1);
      expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
    });

    it('should not pause auto hide when disabled and window lost focus', async () => {
      const handleClose = spy();
      const autoHideDuration = 2e3;
      await render(
        <Snackbar
          open
          onClose={handleClose}
          autoHideDuration={autoHideDuration}
          disableWindowBlurListener
        >
          Message
        </Snackbar>,
      );

      await act(async () => {
        const event = new window.Event('blur', { bubbles: false, cancelable: false });
        window.dispatchEvent(event);
      });

      expect(handleClose.callCount).to.equal(0);

      await act(async () => {
        await timer?.tickAsync(autoHideDuration);
      });

      expect(handleClose.callCount).to.equal(1);
      expect(handleClose.args[0]).to.deep.equal([null, 'timeout']);
    });
  });

  describe('prop: open', () => {
    it('should not render anything when closed', async () => {
      const { container } = await render(<Snackbar open={false}>Hello World!</Snackbar>);
      expect(container).to.have.text('');
    });

    it('should be able show it after mounted', async () => {
      const { container, setProps } = await render(<Snackbar open={false}>Hello World!</Snackbar>);
      expect(container).to.have.text('');
      setProps({ open: true });
      expect(container).to.have.text('Hello World!');
    });
  });
});
