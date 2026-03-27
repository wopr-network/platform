import { BotSettingsClient } from "@/components/bot-settings/bot-settings-client";

export default async function BotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <BotSettingsClient botId={id} />
    </div>
  );
}
