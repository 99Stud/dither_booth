import type { FC } from "react";

import { QueryClient, useQuery } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import { useTheme } from "next-themes";

import { renderWithProviders, screen } from "./render";

const ThemeName: FC = () => <p>{useTheme().resolvedTheme}</p>;

const Greeting: FC = () => {
  const { data } = useQuery({
    queryKey: ["greeting"],
    queryFn: () => "hello",
  });
  return <p>{data ?? "loading"}</p>;
};

describe("renderWithProviders", () => {
  test("starts on the light theme", () => {
    renderWithProviders(<ThemeName />);

    expect(screen.getByText("light")).toBeDefined();
  });

  test("starts on the theme it is given", () => {
    renderWithProviders(<ThemeName />, { theme: "dark" });

    expect(screen.getByText("dark")).toBeDefined();
  });

  test("runs queries", async () => {
    renderWithProviders(<Greeting />);

    expect(await screen.findByText("hello")).toBeDefined();
  });

  test("uses the query client it is given", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["greeting"], "cached");

    renderWithProviders(<Greeting />, { queryClient });

    expect(screen.getByText("cached")).toBeDefined();
  });
});
