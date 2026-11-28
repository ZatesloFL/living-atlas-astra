const subjectKey = ({placeId,thingId,versionId}) => JSON.stringify([placeId,thingId??null,versionId]);

export function builderSubject(room, node = room) {
  if (typeof node.recordVersionId!=='string' || !node.recordVersionId) return null;
  return {placeId:room.id,thingId:node===room?null:node.id,versionId:node.recordVersionId};
}

// Keep the first Receipt for each authored Thing version. A later arrangement
// can publish the same Thing without publishing its material again.
export function builderPublications(roomKey, room, receipts) {
  const publications = new Map();
  for (const receipt of receipts) {
    if (receipt.action!=='build_published' || receipt.actor!==room.ownerId) continue;
    if(receipt.diff.roomKey===roomKey) {
      const place = {placeId:room.id,thingId:null,versionId:receipt.diff.revisionId};
      publications.set(subjectKey(place),receipt);
      for (const subject of receipt.diff.ownedRecordVersions??[]) {
        if (subject.placeId!==room.id || typeof subject.thingId!=='string' || typeof subject.versionId!=='string') continue;
        const key = subjectKey(subject);
        if (!publications.has(key)) publications.set(key,receipt);
      }
    }
    if(room.builderStructure) for(const subject of receipt.diff.ownedPlaceVersions??[]) {
      if(subject.placeId!==room.id||subject.pieceId!==room.builderStructure.pieceId||typeof subject.versionId!=='string')continue;
      const key=subjectKey(subject);
      if(!publications.has(key))publications.set(key,receipt);
    }
  }
  return publications;
}

export function submissionFor(target, actor, publicationReceiptRef, receipts) {
  const key = subjectKey(target);
  return receipts.find(receipt=>receipt.action==='build_vouched' && receipt.actor===actor &&
    receipt.diff.publicationReceiptRef===publicationReceiptRef &&
    receipt.diff.target && subjectKey(receipt.diff.target)===key);
}

export function builderPublication(target, publications) {
  return target && publications.get(subjectKey(target));
}

export function stampBuilderProvenance(roomKey, room, receipts) {
  const publications = builderPublications(roomKey,room,receipts);
  const vouchers = new Map();
  for (const receipt of receipts) {
    if (receipt.action!=='build_vouched' || !receipt.diff.target) continue;
    const key = subjectKey(receipt.diff.target);
    const publication = publications.get(key);
    if (!publication || receipt.diff.publicationReceiptRef!=='builder:'+publication.hash) continue;
    if (!vouchers.has(key)) vouchers.set(key,new Set());
    vouchers.get(key).add(receipt.actor);
  }

  const stamp = node => {
    const subject = builderSubject(room,node);
    const publication = builderPublication(subject,publications);
    if (!publication) return node;
    const {publishedAt, vouches, ...authored} = node;
    const count = vouchers.get(subjectKey(subject))?.size;
    return {...authored,publishedAt:publication.time,...(count?{vouches:count}:{})};
  };
  return {...stamp(room),blocks:(room.blocks??[]).map(stamp)};
}
