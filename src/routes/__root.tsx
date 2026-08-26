import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EllaCakeHub" },
      { name: "description", content: "Real-time bakery management for EllaCakeHub." },
      { property: "og:title", content: "EllaCakeHub" },
      { name: "twitter:title", content: "EllaCakeHub" },
      { property: "og:description", content: "Real-time bakery management for EllaCakeHub." },
      { name: "twitter:description", content: "Real-time bakery management for EllaCakeHub." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/76898f72-2208-49d2-96b2-a44b9a631a1b/id-preview-57bc7bd1--b97d9cc8-7b86-48f4-a13f-ba796ef6e261.lovable.app-1776973076342.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/76898f72-2208-49d2-96b2-a44b9a631a1b/id-preview-57bc7bd1--b97d9cc8-7b86-48f4-a13f-ba796ef6e261.lovable.app-1776973076342.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors closeButton position="top-right" />
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <div className="font-display text-7xl font-semibold">404</div>
        <p className="mt-2 text-muted-foreground">This page rose, then vanished.</p>
        <a href="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Go home</a>
      </div>
    </div>
  );
}
