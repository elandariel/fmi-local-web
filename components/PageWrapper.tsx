// components/PageWrapper.tsx
// Wrapper konsisten untuk semua halaman — padding & max-width seragam

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: boolean;
}

export default function PageWrapper({
  children,
  className = '',
  maxWidth = true,
}: PageWrapperProps) {
  return (
    <div
      className={`
        min-h-screen p-5 md:p-7
        ${maxWidth ? 'max-w-[1600px] mx-auto' : ''}
        ${className}
      `}
      style={{ background: 'var(--bg-base)', fontFamily: "'Inter', sans-serif" }}
    >
      {children}
    </div>
  );
}
