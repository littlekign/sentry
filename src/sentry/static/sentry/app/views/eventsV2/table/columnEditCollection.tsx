import React from 'react';
import ReactDOM from 'react-dom';
import styled from '@emotion/styled';

import Button from 'app/components/button';
import {SectionHeading} from 'app/components/charts/styles';
import {
  UserSelectValues,
  setBodyUserSelect,
} from 'app/components/events/interfaces/spans/utils';
import {IconAdd, IconDelete, IconGrabbable} from 'app/icons';
import {t} from 'app/locale';
import {SelectValue, OrganizationSummary} from 'app/types';
import space from 'app/styles/space';
import theme from 'app/utils/theme';
import {Column, AGGREGATIONS, FIELDS, TRACING_FIELDS} from 'app/utils/discover/fields';

import {FieldValue, FieldValueKind} from './types';
import {ColumnEditRow} from './columnEditRow';

type Props = {
  // Input columns
  columns: Column[];
  organization: OrganizationSummary;
  tagKeys: null | string[];
  // Fired when columns are added/removed/modified
  onChange: (columns: Column[]) => void;
};

type State = {
  isDragging: boolean;
  draggingIndex: undefined | number;
  draggingTargetIndex: undefined | number;
  left: undefined | number;
  top: undefined | number;
  // Stored as a object so we can find elements later.
  fieldOptions: Record<string, SelectValue<FieldValue>>;
};

const DRAG_CLASS = 'draggable-item';
const GRAB_HANDLE_FUDGE = 25;

enum PlaceholderPosition {
  TOP,
  BOTTOM,
}

class ColumnEditCollection extends React.Component<Props, State> {
  state = {
    isDragging: false,
    draggingIndex: void 0,
    draggingTargetIndex: void 0,
    left: void 0,
    top: void 0,
    fieldOptions: {},
  };

  componentDidMount() {
    if (!this.portal) {
      const portal = document.createElement('div');

      portal.style.position = 'absolute';
      portal.style.top = '0';
      portal.style.left = '0';
      portal.style.zIndex = String(theme.zIndex.modal);

      this.portal = portal;

      document.body.appendChild(this.portal);
    }
    this.syncFields();
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.tagKeys !== prevProps.tagKeys) {
      this.syncFields();
    }
  }

  componentWillUnmount() {
    if (this.portal) {
      document.body.removeChild(this.portal);
    }
    this.cleanUpListeners();
  }

  previousUserSelect: UserSelectValues | null = null;
  portal: HTMLElement | null = null;
  dragGhostRef = React.createRef<HTMLDivElement>();

  syncFields() {
    const {organization, tagKeys} = this.props;

    let fields = Object.keys(FIELDS);
    let functions = Object.keys(AGGREGATIONS);

    // Strip tracing features if the org doesn't have access.
    if (!organization.features.includes('transaction-events')) {
      fields = fields.filter(item => !TRACING_FIELDS.includes(item));
      functions = functions.filter(item => !TRACING_FIELDS.includes(item));
    }
    const fieldOptions: Record<string, SelectValue<FieldValue>> = {};

    // Index items by prefixed keys as custom tags
    // can overlap both fields and function names.
    // Having a mapping makes finding the value objects easier
    // later as well.
    functions.forEach(func => {
      const ellipsis = AGGREGATIONS[func].parameters.length ? '\u2026' : '';
      fieldOptions[`function:${func}`] = {
        label: `${func}(${ellipsis})`,
        value: {
          kind: FieldValueKind.FUNCTION,
          meta: {
            name: func,
            parameters: AGGREGATIONS[func].parameters,
          },
        },
      };
    });

    fields.forEach(field => {
      fieldOptions[`field:${field}`] = {
        label: field,
        value: {
          kind: FieldValueKind.FIELD,
          meta: {
            name: field,
            dataType: FIELDS[field],
          },
        },
      };
    });

    if (tagKeys !== null) {
      tagKeys.forEach(tag => {
        fieldOptions[`tag:${tag}`] = {
          label: tag,
          value: {
            kind: FieldValueKind.TAG,
            meta: {name: tag, dataType: 'string'},
          },
        };
      });
    }

    this.setState({fieldOptions});
  }

  keyForColumn(column: Column, isGhost: boolean): string {
    if (column.kind === 'function') {
      return [...column.function, isGhost].join(':');
    }
    return [...column.field, isGhost].join(':');
  }

  cleanUpListeners() {
    if (this.state.isDragging) {
      window.removeEventListener('mousemove', this.onDragMove);
      window.removeEventListener('mouseup', this.onDragEnd);
    }
  }

  // Signal to the parent that a new column has been added.
  handleAddColumn = () => {
    const newColumn: Column = {kind: 'field', field: ''};
    this.props.onChange([...this.props.columns, newColumn]);
  };

  handleUpdateColumn = (index: number, column: Column) => {
    const newColumns = [...this.props.columns];
    newColumns.splice(index, 1, column);
    this.props.onChange(newColumns);
  };

  removeColumn(index: number) {
    const newColumns = [...this.props.columns];
    newColumns.splice(index, 1);
    this.props.onChange(newColumns);
  }

  startDrag(event: React.MouseEvent<HTMLButtonElement>, index: number) {
    const isDragging = this.state.isDragging;
    if (isDragging || event.type !== 'mousedown') {
      return;
    }

    // prevent the user from selecting things when dragging a column.
    this.previousUserSelect = setBodyUserSelect({
      userSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none',
    });

    // attach event listeners so that the mouse cursor can drag anywhere
    window.addEventListener('mousemove', this.onDragMove);
    window.addEventListener('mouseup', this.onDragEnd);

    this.setState({
      isDragging: true,
      draggingIndex: index,
      draggingTargetIndex: index,
      top: event.pageY,
      left: event.pageX,
    });
  }

  onDragMove = (event: MouseEvent) => {
    if (!this.state.isDragging || event.type !== 'mousemove') {
      return;
    }

    if (this.dragGhostRef.current) {
      // move the ghost box
      const ghostDOM = this.dragGhostRef.current;
      // Adjust so cursor is over the grab handle.
      ghostDOM.style.left = `${event.pageX - GRAB_HANDLE_FUDGE}px`;
      ghostDOM.style.top = `${event.pageY - GRAB_HANDLE_FUDGE}px`;
    }

    const dragItems = document.querySelectorAll(`.${DRAG_CLASS}`);
    // Find the item that the ghost is currently over.
    const targetIndex = Array.from(dragItems).findIndex(dragItem => {
      const rects = dragItem.getBoundingClientRect();
      const top = event.clientY;

      const thresholdStart = rects.top;
      const thresholdEnd = rects.top + rects.height;

      return top >= thresholdStart && top <= thresholdEnd;
    });

    if (targetIndex >= 0 && targetIndex !== this.state.draggingTargetIndex) {
      this.setState({draggingTargetIndex: targetIndex});
    }
  };

  onDragEnd = (event: MouseEvent) => {
    if (!this.state.isDragging || event.type !== 'mouseup') {
      return;
    }

    const sourceIndex = this.state.draggingIndex;
    const targetIndex = this.state.draggingTargetIndex;
    if (typeof sourceIndex !== 'number' || typeof targetIndex !== 'number') {
      return;
    }

    // remove listeners that were attached in startColumnDrag
    this.cleanUpListeners();

    // restore body user-select values
    if (this.previousUserSelect) {
      setBodyUserSelect(this.previousUserSelect);
      this.previousUserSelect = null;
    }

    // Reorder columns and trigger change.
    const newColumns = [...this.props.columns];
    const removed = newColumns.splice(sourceIndex, 1);
    newColumns.splice(targetIndex, 0, removed[0]);
    this.props.onChange(newColumns);

    this.setState({
      isDragging: false,
      left: undefined,
      top: undefined,
      draggingIndex: undefined,
      draggingTargetIndex: undefined,
    });
  };

  renderGhost(gridColumns: number) {
    const index = this.state.draggingIndex;
    if (typeof index !== 'number' || !this.state.isDragging || !this.portal) {
      return null;
    }
    const top = Number(this.state.top) - GRAB_HANDLE_FUDGE;
    const left = Number(this.state.left) - GRAB_HANDLE_FUDGE;
    const col = this.props.columns[index];

    const style = {
      top: `${top}px`,
      left: `${left}px`,
    };
    const ghost = (
      <Ghost ref={this.dragGhostRef} style={style}>
        {this.renderItem(col, index, {isGhost: true, gridColumns})}
      </Ghost>
    );

    return ReactDOM.createPortal(ghost, this.portal);
  }

  renderItem(
    col: Column,
    i: number,
    {
      canDelete = true,
      isGhost = false,
      gridColumns = 2,
    }: {canDelete?: boolean; isGhost?: boolean; gridColumns: number}
  ) {
    const {isDragging, draggingTargetIndex, draggingIndex, fieldOptions} = this.state;

    let placeholder: React.ReactNode = null;
    // Add a placeholder above the target row.
    if (isDragging && isGhost === false && draggingTargetIndex === i) {
      placeholder = (
        <DragPlaceholder
          key={`placeholder:${this.keyForColumn(col, isGhost)}`}
          className={DRAG_CLASS}
        />
      );
    }

    // If the current row is the row in the drag ghost return the placeholder
    // or a hole if the placeholder is elsewhere.
    if (isDragging && isGhost === false && draggingIndex === i) {
      return placeholder;
    }

    const position =
      Number(draggingTargetIndex) <= Number(draggingIndex)
        ? PlaceholderPosition.TOP
        : PlaceholderPosition.BOTTOM;

    return (
      <React.Fragment key={`${i}:${this.keyForColumn(col, isGhost)}`}>
        {position === PlaceholderPosition.TOP && placeholder}
        <RowContainer className={isGhost ? '' : DRAG_CLASS}>
          {canDelete ? (
            <Button
              aria-label={t('Drag to reorder')}
              onMouseDown={event => this.startDrag(event, i)}
              icon={<IconGrabbable color={theme.gray4} />}
              borderless
            />
          ) : (
            <span />
          )}
          <ColumnEditRow
            fieldOptions={fieldOptions}
            gridColumns={gridColumns}
            column={col}
            parentIndex={i}
            onChange={this.handleUpdateColumn}
            takeFocus={i === this.props.columns.length - 1}
          />
          {canDelete ? (
            <Button
              aria-label={t('Remove column')}
              onClick={() => this.removeColumn(i)}
              icon={<IconDelete color={theme.gray2} />}
              borderless
            />
          ) : (
            <span />
          )}
        </RowContainer>
        {position === PlaceholderPosition.BOTTOM && placeholder}
      </React.Fragment>
    );
  }

  render() {
    const {columns} = this.props;
    const canDelete = columns.length > 1;

    // Get the longest number of columns so we can layout the rows.
    // We always want at least 2 columns.
    const gridColumns = Math.max(
      ...columns.map(col =>
        col.kind === 'function' && col.function[2] !== undefined ? 3 : 2
      )
    );

    return (
      <div>
        {this.renderGhost(gridColumns)}
        <RowContainer>
          <Heading gridColumns={gridColumns}>
            <StyledSectionHeading>{t('Tag / Field / Function')}</StyledSectionHeading>
            <StyledSectionHeading>{t('Field Parameter')}</StyledSectionHeading>
          </Heading>
        </RowContainer>
        {columns.map((col: Column, i: number) =>
          this.renderItem(col, i, {canDelete, gridColumns})
        )}
        <RowContainer>
          <Actions>
            <Button
              size="small"
              label={t('Add a Column')}
              onClick={this.handleAddColumn}
              icon={<IconAdd circle size="xs" />}
            >
              {t('Add a Column')}
            </Button>
          </Actions>
        </RowContainer>
      </div>
    );
  }
}

const RowContainer = styled('div')`
  display: grid;
  grid-template-columns: 30px auto 30px;
  align-items: center;
  width: 100%;
  padding-bottom: ${space(1)};
`;

const Ghost = styled('div')`
  background: ${p => p.theme.white};
  display: block;
  position: absolute;
  padding: 4px;
  border: 4px solid ${p => p.theme.borderLight};
  border-radius: 4px;
  width: 450px;
  opacity: 0.8;
  cursor: grabbing;

  & > ${RowContainer} {
    padding-bottom: 0;
  }

  & svg {
    cursor: grabbing;
  }
`;

const DragPlaceholder = styled('div')`
  margin: 0 ${space(1)} ${space(1)} ${space(1)};
  border: 2px dashed ${p => p.theme.borderLight};
  width: 100%;
  height: 38px;
`;

const Actions = styled('div')`
  grid-column: 2 / 3;
`;

const Heading = styled('div')<{gridColumns: number}>`
  grid-column: 2 / 3;

  /* Emulate the grid used in the column editor rows */
  display: grid;
  grid-template-columns: repeat(${p => p.gridColumns}, 1fr);
  grid-column-gap: ${space(1)};
`;

const StyledSectionHeading = styled(SectionHeading)`
  margin-bottom: 0;
`;

export default ColumnEditCollection;
