import {Component} from 'react';

import {rectOfContent} from 'sentry/components/performance/waterfall/utils';
import clamp from 'sentry/utils/number/clamp';
import {PerformanceInteraction} from 'sentry/utils/performanceForSentry';
import type {UserSelectValues} from 'sentry/utils/userselect';
import {setBodyUserSelect} from 'sentry/utils/userselect';

// we establish the minimum window size so that the window size of 0% is not possible
const MINIMUM_WINDOW_SIZE = 0.5 / 100; // 0.5% window size

enum ViewHandleType {
  LEFT = 0,
  RIGHT = 1,
}

export type DragManagerChildrenProps = {
  // handles

  isDragging: boolean;

  // between 0 to 1
  // window selection
  isWindowSelectionDragging: boolean;
  leftHandlePosition: number;

  // left-side handle
  onLeftHandleDragStart: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  // between 0 to 1
  // right-side handle
  onRightHandleDragStart: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;

  onWindowSelectionDragStart: (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => void;
  rightHandlePosition: number;
  // between 0 to 1
  viewWindowEnd: number;
  // window sizes
  viewWindowStart: number;
  // between 0 (0%) and 1 (100%)
  windowSelectionCurrent: number;

  windowSelectionInitial: number;
  // between 0 (0%) and 1 (100%)
  windowSelectionSize: number; // between 0 to 1
};

type DragManagerProps = {
  children: (props: DragManagerChildrenProps) => React.JSX.Element;

  // this is the DOM element where the drag events occur. it's also the reference point
  // for calculating the relative mouse x coordinate.
  interactiveLayerRef: React.RefObject<HTMLDivElement | null>;
};

type DragManagerState = {
  currentDraggingHandle: ViewHandleType | undefined;
  // draggable handles
  isDragging: boolean;
  // window selection
  isWindowSelectionDragging: boolean;
  leftHandlePosition: number;

  rightHandlePosition: number;
  viewWindowEnd: number;
  // window sizes
  viewWindowStart: number;
  windowSelectionCurrent: number;

  windowSelectionInitial: number;
  windowSelectionSize: number;
};

class DragManager extends Component<DragManagerProps, DragManagerState> {
  state: DragManagerState = {
    // draggable handles

    isDragging: false,
    currentDraggingHandle: void 0,
    leftHandlePosition: 0, // positioned on the left-most side at 0%
    rightHandlePosition: 1, // positioned on the right-most side at 100%

    // window selection

    isWindowSelectionDragging: false,
    windowSelectionInitial: 0, // between 0 (0%) and 1 (100%)
    windowSelectionCurrent: 0, // between 0 (0%) and 1 (100%)
    windowSelectionSize: 0,

    // window sizes

    viewWindowStart: 0,
    viewWindowEnd: 1,
  };

  componentWillUnmount() {
    this.cleanUpListeners();
  }

  previousUserSelect: UserSelectValues | null = null;

  hasInteractiveLayer = (): boolean => !!this.props.interactiveLayerRef.current;

  onDragStart =
    (viewHandle: ViewHandleType) =>
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const isDragging = this.state.isDragging || this.state.isWindowSelectionDragging;

      if (isDragging || event.type !== 'mousedown' || !this.hasInteractiveLayer()) {
        return;
      }

      PerformanceInteraction.startInteraction('SpanTreeHandleDrag');

      // prevent the user from selecting things outside the minimap when dragging
      // the mouse cursor outside the minimap

      this.previousUserSelect = setBodyUserSelect({
        userSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        webkitUserSelect: 'none',
      });

      // attach event listeners so that the mouse cursor can drag outside of the
      // minimap
      window.addEventListener('mousemove', this.onDragMove);
      window.addEventListener('mouseup', this.onDragEnd);

      // indicate drag has begun

      this.setState({
        isDragging: true,
        isWindowSelectionDragging: false,
        currentDraggingHandle: viewHandle,
      });
    };

  onLeftHandleDragStart = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    this.onDragStart(ViewHandleType.LEFT)(event);
  };

  onRightHandleDragStart = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    this.onDragStart(ViewHandleType.RIGHT)(event);
  };

  onDragMove = (event: MouseEvent) => {
    if (
      !this.state.isDragging ||
      event.type !== 'mousemove' ||
      !this.hasInteractiveLayer()
    ) {
      return;
    }

    const rect = rectOfContent(this.props.interactiveLayerRef.current!);

    // mouse x-coordinate relative to the interactive layer's left side
    const rawMouseX = (event.pageX - rect.x) / rect.width;

    switch (this.state.currentDraggingHandle) {
      case ViewHandleType.LEFT: {
        const min = 0;
        const max = this.state.rightHandlePosition - MINIMUM_WINDOW_SIZE;

        this.setState({
          // clamp rawMouseX to be within [0, rightHandlePosition - MINIMUM_WINDOW_SIZE]
          leftHandlePosition: clamp(rawMouseX, min, max),
        });
        break;
      }
      case ViewHandleType.RIGHT: {
        const min = this.state.leftHandlePosition + MINIMUM_WINDOW_SIZE;
        const max = 1;

        this.setState({
          // clamp rawMouseX to be within [leftHandlePosition + MINIMUM_WINDOW_SIZE, 1]
          rightHandlePosition: clamp(rawMouseX, min, max),
        });
        break;
      }
      default: {
        throw new Error('this.state.currentDraggingHandle is undefined');
      }
    }
  };

  onDragEnd = (event: MouseEvent) => {
    if (
      !this.state.isDragging ||
      event.type !== 'mouseup' ||
      !this.hasInteractiveLayer()
    ) {
      return;
    }

    PerformanceInteraction.finishInteraction();

    // remove listeners that were attached in onDragStart

    this.cleanUpListeners();

    // restore body styles

    if (this.previousUserSelect) {
      setBodyUserSelect(this.previousUserSelect);
      this.previousUserSelect = null;
    }

    // indicate drag has ended

    switch (this.state.currentDraggingHandle) {
      case ViewHandleType.LEFT: {
        this.setState(state => ({
          isDragging: false,
          currentDraggingHandle: void 0,

          // commit leftHandlePosition to be viewWindowStart
          viewWindowStart: state.leftHandlePosition,
        }));
        return;
      }
      case ViewHandleType.RIGHT: {
        this.setState(state => ({
          isDragging: false,
          currentDraggingHandle: void 0,

          // commit rightHandlePosition to be viewWindowEnd
          viewWindowEnd: state.rightHandlePosition,
        }));
        return;
      }
      default: {
        throw new Error('this.state.currentDraggingHandle is undefined');
      }
    }
  };

  onWindowSelectionDragStart = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const isDragging = this.state.isDragging || this.state.isWindowSelectionDragging;

    if (isDragging || event.type !== 'mousedown' || !this.hasInteractiveLayer()) {
      return;
    }

    PerformanceInteraction.startInteraction('SpanTreeWindowDrag');

    // prevent the user from selecting things outside the minimap when dragging
    // the mouse cursor outside the minimap

    this.previousUserSelect = setBodyUserSelect({
      userSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none',
      webkitUserSelect: 'none',
    });

    // attach event listeners so that the mouse cursor can drag outside of the
    // minimap
    window.addEventListener('mousemove', this.onWindowSelectionDragMove);
    window.addEventListener('mouseup', this.onWindowSelectionDragEnd);

    // indicate drag has begun

    const rect = rectOfContent(this.props.interactiveLayerRef.current!);

    // mouse x-coordinate relative to the interactive layer's left side
    const rawMouseX = (event.pageX - rect.x) / rect.width;

    this.setState({
      isDragging: false,
      isWindowSelectionDragging: true,
      windowSelectionInitial: rawMouseX, // between 0 (0%) and 1 (100%)
      windowSelectionCurrent: rawMouseX, // between 0 (0%) and 1 (100%)
    });
  };

  onWindowSelectionDragMove = (event: MouseEvent) => {
    if (
      !this.state.isWindowSelectionDragging ||
      event.type !== 'mousemove' ||
      !this.hasInteractiveLayer()
    ) {
      return;
    }

    const rect = rectOfContent(this.props.interactiveLayerRef.current!);

    // mouse x-coordinate relative to the interactive layer's left side
    const rawMouseX = (event.pageX - rect.x) / rect.width;

    const min = 0;
    const max = 1;

    // clamp rawMouseX to be within [0, 1]
    const windowSelectionCurrent = clamp(rawMouseX, min, max);

    const windowSelectionSize = clamp(
      Math.abs(this.state.windowSelectionInitial - windowSelectionCurrent),
      min,
      max
    );

    this.setState({
      windowSelectionCurrent,
      windowSelectionSize,
    });
  };

  onWindowSelectionDragEnd = (event: MouseEvent) => {
    if (
      !this.state.isWindowSelectionDragging ||
      event.type !== 'mouseup' ||
      !this.hasInteractiveLayer()
    ) {
      return;
    }

    PerformanceInteraction.finishInteraction();

    // remove listeners that were attached in onWindowSelectionDragStart

    this.cleanUpListeners();

    // restore body styles

    if (this.previousUserSelect) {
      setBodyUserSelect(this.previousUserSelect);
      this.previousUserSelect = null;
    }

    // indicate drag has ended

    this.setState(state => {
      let viewWindowStart = Math.min(
        state.windowSelectionInitial,
        state.windowSelectionCurrent
      );
      let viewWindowEnd = Math.max(
        state.windowSelectionInitial,
        state.windowSelectionCurrent
      );

      // enforce minimum window size
      if (viewWindowEnd - viewWindowStart < MINIMUM_WINDOW_SIZE) {
        viewWindowEnd = viewWindowStart + MINIMUM_WINDOW_SIZE;

        if (viewWindowEnd > 1) {
          viewWindowEnd = 1;
          viewWindowStart = 1 - MINIMUM_WINDOW_SIZE;
        }
      }

      return {
        isWindowSelectionDragging: false,
        windowSelectionInitial: 0,
        windowSelectionCurrent: 0,
        windowSelectionSize: 0,

        leftHandlePosition: viewWindowStart,
        rightHandlePosition: viewWindowEnd,

        viewWindowStart,
        viewWindowEnd,
      };
    });
  };

  cleanUpListeners = () => {
    if (this.state.isDragging) {
      window.removeEventListener('mousemove', this.onDragMove);
      window.removeEventListener('mouseup', this.onDragEnd);
    }

    if (this.state.isWindowSelectionDragging) {
      window.removeEventListener('mousemove', this.onWindowSelectionDragMove);
      window.removeEventListener('mouseup', this.onWindowSelectionDragEnd);
    }
  };

  render() {
    const childrenProps = {
      isDragging: this.state.isDragging,

      // left handle

      onLeftHandleDragStart: this.onLeftHandleDragStart,
      leftHandlePosition: this.state.leftHandlePosition,

      // right handle

      onRightHandleDragStart: this.onRightHandleDragStart,
      rightHandlePosition: this.state.rightHandlePosition,

      // window selection

      isWindowSelectionDragging: this.state.isWindowSelectionDragging,
      windowSelectionInitial: this.state.windowSelectionInitial,
      windowSelectionCurrent: this.state.windowSelectionCurrent,
      windowSelectionSize: this.state.windowSelectionSize,
      onWindowSelectionDragStart: this.onWindowSelectionDragStart,

      // window sizes

      viewWindowStart: this.state.viewWindowStart,
      viewWindowEnd: this.state.viewWindowEnd,
    };

    return this.props.children(childrenProps);
  }
}

export default DragManager;
