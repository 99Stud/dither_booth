import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#components/ui/tabs.tsx";
import { type FC, useState } from "react";

import { LotteryAnalyticsTab } from "./internal/LotteryAnalyticsTab.tsx";
import { LotteryConfigTab } from "./internal/LotteryConfigTab.tsx";
import { LotteryLotsTab } from "./internal/LotteryLotsTab.tsx";
import { LotterySimulationTab } from "./internal/LotterySimulationTab.tsx";
import { LotteryTuneTab } from "./internal/LotteryTuneTab.tsx";

type Tab = "config" | "lots" | "analytics" | "simulation" | "tune";

export const AdminLottery: FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("lots");

  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <header className="border-b px-4 py-4 sm:px-6 lg:px-8">
        <h1 className="text-sm font-semibold tracking-tight">Lottery admin</h1>
      </header>

      <div className="flex flex-col px-4 pt-4 pb-10 sm:px-6 lg:px-8">
        <Tabs>
          <TabsList>
            <TabsTrigger
              active={activeTab === "lots"}
              onClick={() => setActiveTab("lots")}
            >
              Lots
            </TabsTrigger>
            <TabsTrigger
              active={activeTab === "config"}
              onClick={() => setActiveTab("config")}
            >
              Configuration
            </TabsTrigger>
            <TabsTrigger
              active={activeTab === "analytics"}
              onClick={() => setActiveTab("analytics")}
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger
              active={activeTab === "simulation"}
              onClick={() => setActiveTab("simulation")}
            >
              Simulation
            </TabsTrigger>
            <TabsTrigger
              active={activeTab === "tune"}
              onClick={() => setActiveTab("tune")}
            >
              Optimization
            </TabsTrigger>
          </TabsList>

          {activeTab === "lots" && (
            <TabsContent>
              <LotteryLotsTab />
            </TabsContent>
          )}
          {activeTab === "config" && (
            <TabsContent>
              <LotteryConfigTab />
            </TabsContent>
          )}
          {activeTab === "analytics" && (
            <TabsContent>
              <LotteryAnalyticsTab />
            </TabsContent>
          )}
          {activeTab === "simulation" && (
            <TabsContent>
              <LotterySimulationTab />
            </TabsContent>
          )}
          {activeTab === "tune" && (
            <TabsContent>
              <LotteryTuneTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};
