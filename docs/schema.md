# Esquema de Datos (Firestore)

## Colección `users`
- **ID:** UID de Firebase Auth.
- **Campos:** `uid`, `email`, `displayName`, `photoUrl`, `role`, `isActive`, `propertyIds`, `createdAt`, `emergencyContact`, `communicationPreferences`.

## Colección `properties`
- **ID:** `propertyId` (legible, ej: "101", "D-15").
- **Campos:** `name`, `address`, `balance`, `currency`, `ownerInfo`, `residentUids`.

## Colección `chargeConcepts`
- **ID:** Auto-generado.
- **Campos:** `name`, `icon` (SVG), `defaultAmount`, `isRecurring`, `billingFrequency`, `isRequestableByResident`, `requiresApproval`.

## Colección `membershipRequests`
- **ID:** `residency_` + `UID` + `propertyId`.
- **Campos:** `userId`, `userEmail`, `userName`, `requestedPropertyId`, `status`, `createdAt`, `processedAt`.

## Colección `serviceRequests`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `chargeConceptId`, `requestDate`, `status`, `residentNotes`, `adminNotes`, `finalAmount`.

## Colección `transactions`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `status`, `amount`, `pendingAmount`, `paidBy` (Array), `appliedTo` (Array), `type`, `description`, `voucherType`, `voucherNumber`, `period`, `createdAt`, `effectiveDate`.

## Colección `paymentNotifications`
- **ID:** Auto-generado.
- **Campos:** `propertyId`, `residentUid`, `amount`, `paymentDate`, `reportDate`, `status`, `receiptUrl`, `appliedTo` (Array), `excessAmount`, `notes`.

## Colección `activities`
- **ID:** Auto-generado.
- **Campos:** `timestamp`, `type`, `description`, `initiator` (Object), `target` (Object), `details` (Object), `visibility` (Array).
