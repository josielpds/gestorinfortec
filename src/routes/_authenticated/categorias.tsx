import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/categorias")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracoes" });
  },
});
