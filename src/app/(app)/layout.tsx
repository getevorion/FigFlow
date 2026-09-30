import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Convert",
  robots: { index: false },
};

/** The converter's shell: flat black; each page renders its own header. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-black">
      {children}
    </div>
  );
}
