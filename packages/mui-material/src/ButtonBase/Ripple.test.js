import * as React from 'react';
import { expect } from 'chai';
import { spy, useFakeTimers } from 'sinon';
import { createRenderer, act } from '@mui/internal-test-utils';
import Ripple from './Ripple';
import classes from './touchRippleClasses';

describe('<Ripple />', () => {
  const { render } = createRenderer();

  it('should have the ripple className', () => {
    const { container } = render(
      <Ripple classes={classes} timeout={0} rippleX={0} rippleY={0} rippleSize={11} />,
    );
    const ripple = container.querySelector('span');
    expect(ripple).to.have.class(classes.ripple);
    expect(ripple).not.to.have.class(classes.fast);
  });

  describe('starting and stopping', () => {
    it('should start the ripple', () => {
      const { container, setProps } = render(
        <Ripple classes={classes} timeout={0} rippleX={0} rippleY={0} rippleSize={11} />,
      );

      setProps({ in: true });

      const ripple = container.querySelector('span');
      expect(ripple).to.have.class(classes.rippleVisible);
    });

    it('should stop the ripple', () => {
      const { container, setProps } = render(
        <Ripple classes={classes} in timeout={0} rippleX={0} rippleY={0} rippleSize={11} />,
      );

      setProps({ in: false });

      const child = container.querySelector('span > span');
      expect(child).to.have.class(classes.childLeaving);
    });
  });

  describe('pulsating and stopping 1', () => {
    it('should render the ripple inside a pulsating Ripple', () => {
      const { container } = render(
        <Ripple classes={classes} timeout={0} rippleX={0} rippleY={0} rippleSize={11} pulsate />,
      );

      const ripple = container.querySelector('span');
      expect(ripple).to.have.class(classes.ripple);
      expect(ripple).to.have.class(classes.ripplePulsate);
      const child = container.querySelector('span > span');
      expect(child).to.have.class(classes.childPulsate);
    });

    it('should start the ripple', () => {
      const { container, setProps } = render(
        <Ripple classes={classes} timeout={0} rippleX={0} rippleY={0} rippleSize={11} pulsate />,
      );

      setProps({ in: true });

      const ripple = container.querySelector('span');
      expect(ripple).to.have.class(classes.rippleVisible);
      const child = container.querySelector('span > span');
      expect(child).to.have.class(classes.childPulsate);
    });

    it('should stop the ripple', () => {
      const { container, setProps } = render(
        <Ripple classes={classes} timeout={0} rippleX={0} rippleY={0} rippleSize={11} pulsate />,
      );

      setProps({ in: true });
      setProps({ in: false });
      const child = container.querySelector('span > span');
      expect(child).to.have.class(classes.childLeaving);
    });
  });

  describe('pulsating and stopping 2', () => {
    /** @type {import('sinon').SinonFakeTimers | null} */
    let timer = null;

    beforeEach(() => {
      timer = useFakeTimers({
        shouldClearNativeTimers: true,
        toFake: [
          'performance',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'Date',
          'requestAnimationFrame',
          'cancelAnimationFrame',
        ],
      });
    });

    afterEach(() => {
      timer?.restore();
    });

    it('handleExit should trigger a timer', async () => {
      const handleExited = spy();
      const { setProps } = render(
        <Ripple
          classes={classes}
          timeout={550}
          in
          onExited={handleExited}
          rippleX={0}
          rippleY={0}
          rippleSize={11}
          pulsate
        />,
      );

      setProps({ in: false });
      await React.act(async () => {
        await timer.tickAsync(549);
      });
      expect(handleExited.callCount).to.equal(0);
      await act(async () => {
        await timer.tickAsync(1);
      });
      expect(handleExited.callCount).to.equal(1);
    });

    it('unmount should defuse the handleExit timer', async () => {
      const handleExited = spy();
      const { setProps, unmount } = render(
        <Ripple
          classes={classes}
          timeout={550}
          in
          onExited={handleExited}
          rippleX={0}
          rippleY={0}
          rippleSize={11}
          pulsate
        />,
      );

      setProps({ in: false });
      unmount();
      await act(async () => {
        await timer.tickAsync(550);
      });
      expect(handleExited.callCount).to.equal(0);
    });
  });
});
