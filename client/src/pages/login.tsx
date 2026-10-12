import * as React from "react";
import { AuthAccessPage } from "@/components/auth-access-page";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  return <AuthAccessPage />;
}
