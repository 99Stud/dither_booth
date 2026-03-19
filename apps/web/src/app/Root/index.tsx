import type { FC } from "react";
import { useState } from "react";
import { trpc } from "../../trpc/client";

export const Root: FC = () => {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  const handlePrint = async () => {
    setStatus("loading");
    setMessage(null);
    try {
      await trpc.print.mutate();
      setStatus("ok");
      setMessage("Print job sent.");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <div className="app">
      <h1>Bun + React</h1>
      <p className="w-full font-bold text-white">
        Edit <code>src/App.tsx</code> and save to test HMR
      </p>
      <button
        type="button"
        className="mt-4 rounded bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
        disabled={status === "loading"}
        onClick={() => void handlePrint()}
      >
        {status === "loading" ? "Printing…" : "Print via tRPC"}
      </button>
      {message ? (
        <p
          className={
            status === "error" ? "mt-2 text-red-400" : "mt-2 text-green-400"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
};
