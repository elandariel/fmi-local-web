// components/PageWrapper.tsx
export default function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    // p-4 di HP, p-8 di Desktop. Beres dalam satu baris.
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full min-h-screen">
      {children}
    </div>
  );
}