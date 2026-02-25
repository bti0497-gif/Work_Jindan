declare module 'react' {
  export type ReactNode = any;
  export interface FC<P = {}> {
    (props: P): ReactNode;
  }
  export interface RefObject<T> {
    current: T | null;
  }
  export function useState<S>(initialState: S | (() => S)): [S, (value: S | ((prev: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useRef<T>(initialValue: T): { current: T };
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useContext<T>(context: any): T;
  export function useReducer<R, I>(reducer: (state: R, action: any) => R, initial: I, init?: (arg: I) => R): [R, (action: any) => void];

  const React: {
    useState: typeof useState;
    useEffect: typeof useEffect;
    useRef: typeof useRef;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
    useContext: typeof useContext;
    useReducer: typeof useReducer;
  };

  export default React;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
