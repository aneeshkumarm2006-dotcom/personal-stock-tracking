'use client'

import { TagsEditor } from '@/components/TagsEditor'

export type HoldingTagsEditorProps = {
  instrumentToken: string
  instrumentSymbol: string
  tags: string[]
}

// Thin wrapper around the generic TagsEditor, preserving the original
// holdings-specific props and behaviour (endpoint, query invalidation).
export function HoldingTagsEditor({
  instrumentToken,
  instrumentSymbol,
  tags,
}: HoldingTagsEditorProps) {
  return (
    <TagsEditor
      entityId={instrumentToken}
      entityLabel={instrumentSymbol || instrumentToken}
      instrumentSymbol={instrumentSymbol}
      tags={tags}
      endpoint={`/api/holdings/${encodeURIComponent(instrumentToken)}/tags`}
      invalidateKeys={[['holdings'], ['tags']]}
      description="Capture your intention for this position (e.g. long term, swing, short term). Type a new tag and press Enter to create it."
    />
  )
}
