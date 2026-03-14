import { useState, useEffect } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DummySidebar } from "./dummy-sidebar";
import { DummyMainView } from "./dummy-main-view";
import { useDummyIds, useDummyActions } from "./hooks";
import { DEFAULT_DUMMY_TITLE } from "@/types/dummy";
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'DummyCreativeSpace');

function EmptyState({ onCreateDummy }: { onCreateDummy: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">No dummies yet</h3>
      <p className="mb-4 max-w-md text-muted-foreground">
        Create a dummy to visualize your story layout with placeholder art
      </p>
      <Button onClick={onCreateDummy}>
        <Plus className="mr-2 h-4 w-4" />
        Create Dummy
      </Button>
    </div>
  );
}

export function DummyCreativeSpace() {
  const dummyIds = useDummyIds();
  const { addDummy } = useDummyActions();

  const [selectedDummyId, setSelectedDummyId] = useState<string | null>(
    dummyIds[0] ?? null
  );

  // Auto-select first dummy when dummies change
  useEffect(() => {
    if (dummyIds.length > 0 && !selectedDummyId) {
      setSelectedDummyId(dummyIds[0]);
    } else if (
      dummyIds.length > 0 &&
      selectedDummyId &&
      !dummyIds.includes(selectedDummyId)
    ) {
      // Selected dummy was deleted, select first
      setSelectedDummyId(dummyIds[0]);
    } else if (dummyIds.length === 0) {
      setSelectedDummyId(null);
    }
  }, [dummyIds, selectedDummyId]);

  const handleDummySelect = (dummyId: string) => {
    setSelectedDummyId(dummyId);
  };

  const handleCreateDummy = () => {
    log.info('handleCreateDummy', 'creating new dummy');
    const newDummy = {
      id: crypto.randomUUID(),
      title: DEFAULT_DUMMY_TITLE,
      type: "prose" as const,
      spreads: [],
    };
    addDummy(newDummy);
    setSelectedDummyId(newDummy.id);
  };

  return (
    <div className="flex h-full">
      <DummySidebar
        selectedDummyId={selectedDummyId}
        onDummySelect={handleDummySelect}
      />
      <div className="flex-1 overflow-hidden">
        {selectedDummyId ? (
          <DummyMainView selectedDummyId={selectedDummyId} />
        ) : (
          <EmptyState onCreateDummy={handleCreateDummy} />
        )}
      </div>
    </div>
  );
}
