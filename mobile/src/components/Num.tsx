import * as React from "react";
import { Text, type TextProps, type TextStyle, StyleSheet } from "react-native";

// Mobile equivalent of the web <Num>. Wraps every quantity, rate,
// amount, and outstanding figure so digits are tabular and columns
// line up. React Native exposes this via `fontVariant: ["tabular-nums"]`.
//
//   <Num>{formatINR(order.grandTotal)}</Num>
//   <Num style={styles.itemValue}>{item.qty}</Num>

export function Num({ style, children, ...rest }: TextProps) {
  return (
    <Text {...rest} style={[styles.num, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  num: {
    // React Native only supports the shorthand keyword here; the
    // font must ship OpenType `tnum` for this to have any effect.
    // Inter (self-hosted via mobile/src/lib/fonts.ts) does.
    fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
  },
});
