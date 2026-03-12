import Layout from "./Layout";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return <Layout>{children}</Layout>;
}

export default AppLayout;
