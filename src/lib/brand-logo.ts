const fallbackLogo =
  "https://phswnczojmrdfioyqsql.supabase.co/storage/v1/object/sign/Address/Imagemaster%20password.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82NDIwYTUxNy05Y2M3LTQzZWUtOWFhMi00NGQ3YjAwMTVhNDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJBZGRyZXNzL0ltYWdlbWFzdGVyIHBhc3N3b3JkLnBuZyIsImlhdCI6MTc3Njg5MzUzOSwiZXhwIjoxODA4NDI5NTM5fQ.qd2dpVQBaYQ84P1DHkde7WTpPZ-25VT2gisyvhCsnFg";

export const BRAND_LOGO_URL = String(process.env.NEXT_PUBLIC_BRAND_LOGO_URL ?? "").trim() || fallbackLogo;
