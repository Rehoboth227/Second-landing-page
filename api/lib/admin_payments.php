<?php
/*
 * Admin console → "Payments to confirm": every bank transfer that is waiting for an administrator,
 * across products, in one place. Confirming still goes through each product's own action
 * (aimove/review, greenfed/admin), so the same rules apply wherever it is done.
 * (AiPay store payments go to each seller's own bank and are confirmed by the seller; the AiPay
 * review fee is confirmed on the seller's application under Applications.)
 */
declare(strict_types=1);

function r_admin_payments(): never
{
    $u = require_admin();
    $uid = (int) $u['id'];
    $products = admin_products($uid);
    $out = [];
    if (in_array('aimove', $products, true)) {
        foreach (q("SELECT l.*, u.full_name, u.email FROM aimove_ledger l JOIN users u ON u.id = l.user_id
                    WHERE l.status = 'pending' AND l.kind IN ('topup', 'payout') ORDER BY l.id LIMIT 300")->fetchAll() as $t) {
            $m = $t['meta'] ? (json_decode($t['meta'], true) ?: []) : [];
            $topup = $t['kind'] === 'topup';
            $out[] = [
                'product' => 'aimove', 'kind' => $t['kind'], 'id' => (string) $t['id'], 'amount' => abs((int) $t['amount']),
                'who' => $t['full_name'], 'email' => $t['email'], 'at' => $t['created_at'], 'own' => (int) $t['user_id'] === $uid,
                'what' => $topup ? 'AiMove wallet top-up' : 'AiMove rider payout',
                'detail' => $topup ? 'Paid from ' . ($m['sender'] ?? '') . ' (' . ($m['bank'] ?? '') . ') into ' . AM_COLLECT['bank_name'] . ' ' . AM_COLLECT['account_number']
                    : 'Send to ' . ($m['bank'] ?? '') . ' ' . ($m['acct'] ?? '') . ' · ' . ($m['name'] ?? ''),
                'yes' => $topup ? 'Money received' : 'I have paid it', 'no' => $topup ? 'Not received' : 'Return to earnings',
            ];
        }
    }
    if (in_array('greenfed', $products, true)) {
        $bank = gf_settings()['bank'];
        foreach (q("SELECT o.*, u.full_name, u.email FROM gf_orders o JOIN users u ON u.id = o.user_id WHERE o.status = 'PAYMENT_SENT' ORDER BY o.id LIMIT 300")->fetchAll() as $o) {
            $out[] = [
                'product' => 'greenfed', 'kind' => $o['kind'], 'id' => (string) $o['id'], 'amount' => (int) $o['total'],
                'who' => $o['full_name'], 'email' => $o['email'], 'at' => $o['updated_at'], 'own' => (int) $o['user_id'] === $uid,
                'what' => $o['kind'] === 'plan' ? 'GreenFed meal plan "' . $o['name'] . '"' : 'GreenFed grocery order #' . $o['id'],
                'detail' => 'Paid from ' . $o['pay_sender'] . ' (' . $o['pay_bank'] . ') into ' . $bank['bank_name'] . ' ' . $bank['account_number'] . ' · ref GF-' . $o['id'],
                'yes' => 'Money received', 'no' => 'Not received',
            ];
        }
    }
    usort($out, fn ($a, $b) => strcmp($a['at'], $b['at']));
    ok(['items' => $out]);
}
