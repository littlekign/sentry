import {createContext, useCallback, useContext, useReducer} from 'react';

import {unreachable} from 'sentry/utils/unreachable';

import type {CommandPaletteActionWithKey} from './types';

type CommandPaletteProviderProps = {children: React.ReactNode};

type CommandPaletteActions = CommandPaletteActionWithKey[];

type Unregister = () => void;
type CommandPaletteRegistration = (actions: CommandPaletteActionWithKey[]) => Unregister;

type CommandPaletteActionReducerAction =
  | {
      actions: CommandPaletteActionWithKey[];
      type: 'register';
    }
  | {
      keys: string[];
      type: 'unregister';
    };

const CommandPaletteRegistrationContext =
  createContext<CommandPaletteRegistration | null>(null);
const CommandPaletteActionsContext = createContext<CommandPaletteActions | null>(null);

export function useCommandPaletteRegistration(): CommandPaletteRegistration {
  const ctx = useContext(CommandPaletteRegistrationContext);
  if (ctx === null) {
    throw new Error(
      'useCommandPaletteRegistration must be wrapped in CommandPaletteProvider'
    );
  }
  return ctx;
}

export function useCommandPaletteActions(): CommandPaletteActionWithKey[] {
  const ctx = useContext(CommandPaletteActionsContext);
  if (ctx === null) {
    throw new Error('useCommandPaletteActions must be wrapped in CommandPaletteProvider');
  }
  return ctx;
}

function actionsReducer(
  state: CommandPaletteActionWithKey[],
  reducerAction: CommandPaletteActionReducerAction
): CommandPaletteActionWithKey[] {
  const type = reducerAction.type;
  switch (type) {
    case 'register': {
      const result = [...state];

      for (const newAction of reducerAction.actions) {
        const existingIndex = result.findIndex(action => action.key === newAction.key);

        if (existingIndex >= 0) {
          result[existingIndex] = newAction;
        } else {
          result.push(newAction);
        }
      }

      return result;
    }
    case 'unregister':
      return state.filter(action => !reducerAction.keys.includes(action.key));
    default:
      unreachable(type);
      return state;
  }
}

export function CommandPaletteProvider({children}: CommandPaletteProviderProps) {
  const [actions, dispatch] = useReducer(actionsReducer, []);

  const registerActions = useCallback(
    (newActions: CommandPaletteActionWithKey[]) => {
      dispatch({type: 'register', actions: newActions});
      return () => {
        dispatch({type: 'unregister', keys: newActions.map(a => a.key)});
      };
    },
    [dispatch]
  );

  return (
    <CommandPaletteRegistrationContext.Provider value={registerActions}>
      <CommandPaletteActionsContext.Provider value={actions}>
        {children}
      </CommandPaletteActionsContext.Provider>
    </CommandPaletteRegistrationContext.Provider>
  );
}
