import { computed, inject, Ref } from 'vue';

import { OSContextKey } from '../constants/inject-keys';
import { HotKeyInfo, OSContext } from '../types';

import useEventListener from './useEventListener';
import useOSContext from './useOSContext';

export interface HotKeyOptions {
  target: Ref<EventTarget> | EventTarget;
  directions: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  exact: boolean; // 当 exact 设置为 true 时，表示在判断快捷键是否匹配时，不仅要考虑按下的按键是否匹配，还需要考虑是否同时满足 Ctrl 键和 Shift 键的状态
}

export const useHotKey = (key: string, onKeyPressed: () => void, opts?: Partial<HotKeyOptions>): HotKeyInfo => {
  const target = opts?.target ?? window;
  let osContext = inject(OSContextKey, undefined);
  if (!osContext) {
    osContext = useOSContext();
  }

  const hotKey = computed(() => {
    const options = opts || {};
    const keyCombination = [];

    if (options.ctrlKey) keyCombination.push(osContext?.OS === 'macOS' ? 'Cmd' : 'Ctrl');
    if (options.shiftKey) keyCombination.push('Shift');

    keyCombination.push(key.toUpperCase());

    return keyCombination.join('+');
  });
  useEventListener(target, 'keydown', (event) => {
    const options = opts || {};
    if (event.key === key.toLowerCase() && matchKeyScheme(options, event, osContext)) {
      event.preventDefault();
      onKeyPressed();
    }
  });
  return {
    hotKey: hotKey.value,
    directions: opts?.directions,
    onKeyPressed,
  };
};

const matchKeyScheme = (
  opts: Pick<Partial<HotKeyOptions>, 'shiftKey' | 'ctrlKey' | 'exact'>,
  event: KeyboardEvent,
  osContext?: OSContext
): boolean => {
  const ctrlKey = opts.ctrlKey ?? false;
  const shiftKey = opts.shiftKey ?? false;
  if (opts.exact) {
    return ctrlKey === (osContext?.OS === 'macOS' ? event.metaKey : event.ctrlKey) && shiftKey === event.shiftKey;
  }
  const satisfiedKeys: boolean[] = [];
  satisfiedKeys.push(ctrlKey === (osContext?.OS === 'macOS' ? event.metaKey : event.ctrlKey));
  satisfiedKeys.push(shiftKey === event.shiftKey);
  return satisfiedKeys.every((item) => item);
};

export default useHotKey;
