import { pageTitle } from "@/lib/pageTitle";

export const generateMetadata = () => pageTitle("Team");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
