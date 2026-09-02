# Physical Membership Card Tracking & RLS Resolution Specification

## 1. Executive Summary & Problems Resolved

1. **Attendance RLS Resolution**: Staff and Admin were experiencing permission rejections when adding check-ins in the logbook due to restrictive date-matching and role lookup expressions in `public.attendance` RLS policies. The updated migration grants clean, authenticated access for staff and admins to create, read, update, and manage logbook attendance.
2. **Cards RLS Resolution**: Staff were previously blocked by restrictive `role = 'admin'` policies from creating or updating card records when registering members or reissuing credentials. Authenticated staff can now seamlessly issue and manage cards.
3. **Physical Membership Card Tracking**: Disentangles credential token existence (`QR` vs `Manual`) from payment status (`PAID` vs `NONE`) and claim/release status (`CLAIMED` vs `UNCLAIMED` vs `NOT_APPLICABLE`).

---

## 2. Database Schema Extensions (`public.cards`)

| Column           | Type          | Default            | Constraints / Allowed Values                   | Description                                                        |
| ---------------- | ------------- | ------------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| `payment_status` | VARCHAR(20)   | `'NONE'`           | `'NONE'`, `'PAID'`, `'REFUNDED'`               | Tracks whether the physical card printing fee was paid.            |
| `claim_status`   | VARCHAR(30)   | `'NOT_APPLICABLE'` | `'NOT_APPLICABLE'`, `'UNCLAIMED'`, `'CLAIMED'` | Tracks whether physical card plastic badge was received by member. |
| `card_fee_paid`  | DECIMAL(10,2) | `0.00`             | `>= 0.00`                                      | Actual card fee recorded on receipt.                               |
| `claimed_at`     | TIMESTAMPTZ   | `NULL`             |                                                | Timestamp when card was marked as claimed / handed over.           |
| `claimed_by`     | TEXT          | `NULL`             |                                                | Staff member or email who verified card release.                   |
| `claim_notes`    | TEXT          | `NULL`             |                                                | Operational notes taken during card claim.                         |
| `receipt_number` | VARCHAR(30)   | `NULL`             |                                                | Linked transaction receipt ID.                                     |

---

## 3. State Machine & Scenarios

### State Matrix:

- **Digital QR Only (No Card Purchased)**: `payment_status = 'NONE'`, `claim_status = 'NOT_APPLICABLE'`
- **Physical Card Purchased, Pending Pickup**: `payment_status = 'PAID'`, `claim_status = 'UNCLAIMED'`
- **Physical Card Claimed & Released**: `payment_status = 'PAID'`, `claim_status = 'CLAIMED'`
- **Card Fee Refunded / Cancelled**: `payment_status = 'REFUNDED'`, `claim_status = 'NOT_APPLICABLE'`

### Flow Scenarios:

1. **Member Registration / Renewal with Physical Card**:
   - Checkbox "Add Physical Card (+₱50)" checked during checkout.
   - Subscription created with `card_fee = 50.00`.
   - Card record issued with `payment_status = 'PAID'`, `claim_status = 'UNCLAIMED'`, `card_fee_paid = 50.00`.
   - Member List badge displays: `✓ PAID • ⚠ NOT CLAIMED`.
2. **Member Registration with Digital QR Only**:
   - Checkbox unchecked.
   - Card credential token created for barcode check-in functionality.
   - Card record set to `payment_status = 'NONE'`, `claim_status = 'NOT_APPLICABLE'`.
3. **Card Pickup & Claim Handover**:
   - Staff opens Member Profile, Member List, or Card Printing Portal.
   - Clicks **"Mark as Claimed"**.
   - System records `claimed_at = now()`, `claimed_by = user.email`, `claim_notes = notes`.
   - Audit log automatically recorded.
4. **Existing Member Buys Physical Card Later**:
   - In Member Profile, staff clicks **"Purchase Physical Card (₱50.00)"**.
   - Receipt generated and card record updated to `payment_status = 'PAID'`, `claim_status = 'UNCLAIMED'`.
