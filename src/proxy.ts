import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const adminPaths = ["/dashboard", "/users", "/approvals", "/audit-logs"];
const userPaths = ["/home", "/vault", "/settings", "/requests"];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const requiresUser = userPaths.some((path) => pathname.startsWith(path));
  const requiresAdmin = adminPaths.some((path) => pathname.startsWith(path));

  if ((requiresUser || requiresAdmin) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (requiresAdmin && user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role;
    if (!["admin", "super_admin", "approver"].includes(role)) {
      return NextResponse.redirect(new URL("/vault", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/home/:path*",
    "/vault/:path*",
    "/settings/:path*",
    "/requests/:path*",
    "/dashboard/:path*",
    "/users/:path*",
    "/approvals/:path*",
    "/audit-logs/:path*",
  ],
};
