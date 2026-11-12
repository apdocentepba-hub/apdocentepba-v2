/**
 * Pure account-home reconciliation for the Insigne planner.
 * Editing schools and work schedules must never silently clear the
 * georeferenced location already saved in an authenticated account.
 */
export function resolvePlannerAccountHomeWrite(accountHome, domicile, selectedPoint) {
 const address_text=String(domicile??'').trim();
 const storedAddress=String(accountHome?.address_text??'').trim();
 const sameAddress=!!storedAddress&&address_text===storedAddress;
 const storedPoint=sameAddress?(accountHome?.georef??null):null;
 const selected=selectedPoint??null;
 // No newly chosen map point means "keep the current saved map point".
 // Only a real address change may legitimately clear coordinates.
 const georef=selected||storedPoint;
 const pointChanged=selected!==null&&JSON.stringify(selected)!==JSON.stringify(storedPoint);
 const needsWrite=!!address_text&&(!sameAddress||pointChanged);
 return {
  address_text,georef,needsWrite,
  reusedSavedGeoref:!!storedPoint&&!selected
 };
}
