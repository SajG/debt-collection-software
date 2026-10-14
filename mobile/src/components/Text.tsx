import { forwardRef } from "react";
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from "react-native";

// Every screen imports Text / TextInput from here, not react-native.
// The phone's font-size setting is honoured up to 1.3× — beyond that
// rows and buttons clip on a 5" screen, so the scale is capped rather
// than ignored.
export const MAX_FONT_SCALE = 1.3;

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  function TextInput(props, ref) {
    return (
      <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />
    );
  },
);
export type { RNTextInput as TextInputRef };
