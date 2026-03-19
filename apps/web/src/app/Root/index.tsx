import type { FC } from "react";

export const Root: FC = () => {
  return (
    <div className="app">
      <h1>Bun + React</h1>
      <p className="text-white w-full font-bold ">
        Edit <code>src/App.tsx</code> and save to test HMR
      </p>
    </div>
  );
};
