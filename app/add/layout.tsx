import { pageTitle } from "@/lib/pageTitle";

export const generateMetadata = () => pageTitle("Add Property");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
