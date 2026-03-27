import { LandingFooter, Nav } from "@/components/landing";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-near-black min-h-screen">
      <Nav />
      <div className="pt-14">{children}</div>
      <LandingFooter />
    </div>
  );
}
