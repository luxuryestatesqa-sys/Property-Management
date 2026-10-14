import { pageTitle } from "@/lib/pageTitle";

export const generateMetadata = () => pageTitle("Property");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
