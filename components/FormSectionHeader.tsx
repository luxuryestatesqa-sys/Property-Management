interface FormSectionHeaderProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
}

// Shared card-header layout (icon + uppercase label + optional inline hint)
// so every section across the add/edit forms reads as one consistent system
// instead of ad-hoc headers per section - matches the pattern already used
// by PrivateDetailsSection.
export default function FormSectionHeader({ icon, label, badge }: FormSectionHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {icon}
      <h3 className="text-[13px] font-semibold text-muted uppercase tracking-wide">
        {label}
        {badge && <span className="text-muted font-normal normal-case ml-1.5">{badge}</span>}
      </h3>
    </div>
  );
}
