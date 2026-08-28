import * as React from "react";

// Wrap every quantity, rate, amount, and outstanding figure. Applies
// the `.num` utility (font-variant-numeric: tabular-nums) so digits
// occupy identical widths and columns line up. See app/globals.css
// for the rule.
//
//   <Num>{formatINR(order.grandTotal)}</Num>
//   <Num as="td" className="text-right">{item.qty}</Num>
//
// Passing `as` lets you keep it inside a table cell without an extra
// wrapper span breaking layout.

type NumProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

export function Num<T extends React.ElementType = "span">({
  as,
  className,
  children,
  ...rest
}: NumProps<T>) {
  const Tag = (as ?? "span") as React.ElementType;
  const joined = className ? `num ${className}` : "num";
  return (
    <Tag className={joined} {...rest}>
      {children}
    </Tag>
  );
}
