import "./tech-money-brand.css";

export type TechMoneyBrandProps = {
  areaLabel: string;
  variant?: "auth" | "compact" | "selection";
  className?: string;
};

export function TechMoneyBrand({
  areaLabel,
  variant = "compact",
  className = "",
}: TechMoneyBrandProps) {
  return (
    <span
      className={`tm-brand-lockup tm-brand-lockup--${variant} ${className}`.trim()}
      aria-label={`Tech Money ${areaLabel}`}
    >
      <span className={`tm-brand-mark${variant === "compact" ? " tm-brand-mark--compact" : ""}`} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="tm-brand-copy">
        <span className="tm-brand-name">TECH MONEY</span>
        <span className="tm-brand-area">{areaLabel}</span>
      </span>
    </span>
  );
}
