// Keyboard height tracker for bottom sheets.
//
// Native (Android): read the keyboard height from the Keyboard events and pad
// the sheet by it. Android Modal windows do not reliably resize, and some OEM
// keyboards (Samsung included) report a height the window does not resize by,
// so KeyboardAvoidingView inside a Modal is unreliable.
//
// Web: there is no Keyboard event in a browser. Use window.visualViewport, which
// shrinks when the on-screen keyboard opens:
//     overlap = window.innerHeight - visualViewport.height - visualViewport.offsetTop
// That is exactly the amount the sheet has to clear. Returning 0 here (as the
// native-only version did) left the currency/country picker behind the keyboard
// on mobile web.

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

function useNativeKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS reports the overlap height; Android reports the full keyboard height.
    const onChange = (e: { endCoordinates: { height: number } }) => {
      setHeight(e.endCoordinates?.height ?? 0);
    };
    const showSub = Keyboard.addListener('keyboardDidShow', onChange);
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

function useWebKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      // offsetTop matters when the page itself is scrolled: the bottom edge of
      // the visual viewport in layout coordinates is what the sheet must clear.
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      // Below ~40px this is a mobile URL-bar collapse, not a keyboard.
      setHeight(overlap > 40 ? Math.round(overlap) : 0);
    };

    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, []);

  return height;
}

/** Height in px currently covered by the software keyboard, else 0. */
export function useKeyboardHeight(): number {
  const native = useNativeKeyboardHeight();
  const web = useWebKeyboardHeight();
  return Platform.OS === 'web' ? web : native;
}