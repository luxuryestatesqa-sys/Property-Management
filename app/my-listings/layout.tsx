import { pageTitle } from "@/lib/pageTitle";

export const generateMetadata = () => pageTitle("My Listings");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
