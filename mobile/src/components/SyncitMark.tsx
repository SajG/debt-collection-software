import * as React from "react";
import Svg, {
  Circle,
  Path,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";

// Mirror of components/brand/SyncitMark.tsx for React Native. Same
// three variants (mono, brand, brand+tile, light), same 512×512
// viewBox, same offsets. Ships as a small react-native-svg tree so
// the mark renders crisp at any size and can rotate cheaply inside
// Animated.View (see SyncPill).

export function SyncitMark({
  size = 24,
  color = "currentColor",
  title = "Syncit",
  variant = "mono",
  tile = false,
}: {
  size?: number;
  color?: string;
  title?: string;
  variant?: "mono" | "brand" | "light";
  tile?: boolean;
}) {
  const strokeWidth = 40;

  if (variant === "mono") {
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        accessibilityLabel={title}
      >
        <Circle
          cx="206"
          cy="206"
          r="84"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx="306"
          cy="306"
          r="84"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Path
          d="M 264.7 266.1 A 84 84 0 0 1 177.7 285.1"
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      </Svg>
    );
  }

  const ringA = variant === "light" ? "#12876C" : "#3DDC97";
  const ringB = variant === "light" ? "#0B1D18" : "#FFFFFF";

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      accessibilityLabel={title}
    >
      {tile ? (
        <>
          <Defs>
            <LinearGradient id="syncit-mark-tile" x1="0" y1="0" x2="0.35" y2="1">
              <Stop offset="0" stopColor="#0D5342" />
              <Stop offset="1" stopColor="#06291F" />
            </LinearGradient>
          </Defs>
          <Rect
            width="512"
            height="512"
            rx="114"
            fill="url(#syncit-mark-tile)"
          />
        </>
      ) : null}
      <Circle
        cx="206"
        cy="206"
        r="84"
        stroke={ringA}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx="306"
        cy="306"
        r="84"
        stroke={ringB}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Path
        d="M 264.7 266.1 A 84 84 0 0 1 177.7 285.1"
        stroke={ringA}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </Svg>
  );
}
