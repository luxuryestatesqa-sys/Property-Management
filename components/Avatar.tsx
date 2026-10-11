"use client";

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  // fixed neutral colour instead of the agency's brand colour (used in the sidebar)
  neutral?: boolean;
}

export default function Avatar({ name, avatarUrl, size = 40, className = "", neutral }: AvatarProps) {
  const initial = name?.charAt(0).toUpperCase() || "?";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ width: size, height: size, background: "var(--primary)", fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
