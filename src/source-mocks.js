import gallery from './mock-gallery.json' with { type: 'json' };

export const mockGallery = gallery;
export const mockDrive = [
  { id: 'notebooks', kind: 'folder', title: 'Notebooks', folderId: null },
  { id: 'reference', kind: 'folder', title: 'Reference', folderId: null },
  { id: 'observations', kind: 'document', title: 'A page of observations', folderId: 'notebooks',
    description: 'Sample notebook for an imaginary archive. Morning light reached the worktable for twenty minutes. Try the same observation tomorrow.' },
  { id: 'reading-list', kind: 'document', title: 'Reading list', folderId: 'reference',
    description: 'Sample reading list. Start with a short article and record one useful question beside its source.' }
];

export const mockSourceSpecs = {
  'collection-db': { label: 'Mock gallery collection', recipe: 'gallery-plinths', syncMode: 'indexed', rightsDefault: 'rights-reserved' },
  drive: { label: 'Mock Drive archive', recipe: 'drive-alcoves', syncMode: 'live', rightsDefault: 'private' }
};

export function mockItems(source, catalog = mockGallery) {
  const items = source.kind === 'collection-db' ? catalog.items : mockDrive;
  return items.map(item => ({
    visibility: source.kind === 'drive' ? 'private' : 'public',
    rights: source.rightsDefault, folderId: null, ...structuredClone(item)
  }));
}

export function mockEditorURL(source, itemId) {
  return '?' + new URLSearchParams({ 'mock-drive': source.id, item: itemId, returnTo: source.placeId }).toString();
}
