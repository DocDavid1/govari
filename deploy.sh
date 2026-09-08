#!/usr/bin/env bash
# =====================================================================
#  פריסה אוטונומית ל-Vercel — בלי שאלות (--yes), מתיקייה באנגלית
#  (עוקף את בעיית שם התיקייה בעברית שגרמה לשגיאת "linked project id")
#  שימוש:   bash ~/Desktop/מצלמה/deploy.sh
# =====================================================================
set -e

SRC="$HOME/Desktop/מצלמה"
DEST="$HOME/Desktop/govari"

echo "▶ מכין עותק פריסה נקי ב: $DEST"
rm -rf "$DEST"
cp -R "$SRC" "$DEST"
cd "$DEST"

# ניקוי קבצים שלא צריך להעלות
rm -rf .vercel node_modules server/node_modules server/data/orders.json supabase/.temp supabase/.branches 2>/dev/null || true
rm -f ./*.mp4 "./מצלמה עם אחורי.png" ./WhatsApp*.jpeg 2>/dev/null || true

echo "▶ מעלה ל-Vercel (ללא שאלות)…"
npx vercel@latest --yes

echo ""
echo "======================================================"
echo "✅ עלה בהצלחה (גרסת preview)."
echo ""
echo "עכשיו 2 דברים אחרונים:"
echo " 1) ב-Vercel → Project 'govari' → Settings → Environment Variables, הוסף:"
echo "      DATABASE_URL      (המחרוזת מ-Supabase, pooler 6543)"
echo "      PGSSL             true"
echo "      OWNER_EMAIL       davidazulay75@gmail.com"
echo "      SERVE_SITE        false"
echo "      PAYMENT_PROVIDER  none"
echo "      RESEND_API_KEY    (כשיהיה)   FROM_EMAIL (כשיהיה)"
echo ""
echo " 2) לפרסום סופי לפרודקשן הרץ מכאן:"
echo "      cd ~/Desktop/govari && npx vercel@latest --prod --yes"
echo "======================================================"
