#!/usr/bin/env bash
set -euo pipefail

# Variables requises (fournies par GitHub Actions)
: "${WEBHOOK_URL:?}"
: "${GIPHY_API_KEY:?}"
: "${STATUS:?}"
: "${PR_TITLE:?}"
: "${PR_URL:?}"
: "${PR_NUMBER:?}"
: "${REPO_FULL_NAME:?}"
: "${REPO_URL:?}"
: "${PR_AUTHOR_LOGIN:?}"
: "${PR_AUTHOR_AVATAR:?}"
: "${ACTOR_LOGIN:?}"

# Variables optionnelles (avec valeurs par défaut)
ACTOR_AVATAR="${ACTOR_AVATAR:-$PR_AUTHOR_AVATAR}"
DESCRIPTION="${DESCRIPTION:-}"
TIMESTAMP="${TIMESTAMP:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
TARGET_DISCORD_ID="${TARGET_DISCORD_ID:-}"
AUTHOR_MENTION="${AUTHOR_MENTION:-**@$PR_AUTHOR_LOGIN**}"
ACTOR_MENTION="${ACTOR_MENTION:-**@$ACTOR_LOGIN**}"
AUTHOR_FOUND="${AUTHOR_FOUND:-false}"
ACTOR_FOUND="${ACTOR_FOUND:-false}"

GREEN=3066993; RED=15158332; PURPLE=10181046; BLUE=3447003; ORANGE=16753920; GRAY=9807270

case "${STATUS}" in
  # Reviews
  approved)
    TITLE="PR approuvée"; ACTION="Approved"; COLOR=$GREEN
    TAGS=("excited" "thumbs up" "congrats" "yes" "perfect")
    MSG="✅ $AUTHOR_MENTION ta PR #$PR_NUMBER a été approuvée par $ACTOR_MENTION !"
    ;;
  changes_requested|changes-requested)
    TITLE="Changements demandés"; ACTION="Changes requested"; COLOR=$RED
    TAGS=("thinking" "oops" "fix it" "work" "coding")
    MSG="🛠️ $AUTHOR_MENTION, $ACTOR_MENTION a demandé des changements sur ta PR #$PR_NUMBER."
    ;;
  commented)
    TITLE="Nouveau commentaire"; ACTION="Commented"; COLOR=$BLUE
    TAGS=("thinking" "hmm" "question" "chat" "talk")
    MSG="💬 $AUTHOR_MENTION, $ACTOR_MENTION a commenté ta PR #$PR_NUMBER."
    ;;
  
  # PR Events
  merged)
    TITLE="PR mergée"; ACTION="Merged"; COLOR=$PURPLE
    TAGS=("celebrate" "party" "success" "ship it" "boom")
    MSG="🎉 $AUTHOR_MENTION ta PR #$PR_NUMBER a été mergée par $ACTOR_MENTION !"
    ;;
  closed)
    TITLE="PR fermée"; ACTION="Closed"; COLOR=$GRAY
    TAGS=("sad" "bye" "no" "stop" "closed")
    MSG="🚫 $AUTHOR_MENTION ta PR #$PR_NUMBER a été fermée par $ACTOR_MENTION."
    ;;
  opened)
    TITLE="Nouvelle PR"; ACTION="Opened"; COLOR=$BLUE
    TAGS=("hello" "hi" "wave" "new" "start")
    MSG="🆕 $AUTHOR_MENTION a ouvert une nouvelle PR #$PR_NUMBER !"
    ;;
  reopened)
    TITLE="PR réouverte"; ACTION="Reopened"; COLOR=$BLUE
    TAGS=("back" "again" "return" "comeback")
    MSG="🔄 $AUTHOR_MENTION a réouvert la PR #$PR_NUMBER !"
    ;;
  ready_for_review)
    TITLE="PR prête pour review"; ACTION="Ready for review"; COLOR=$GREEN
    TAGS=("ready" "let's go" "start" "ok" "good")
    MSG="✨ $AUTHOR_MENTION la PR #$PR_NUMBER est prête pour review !"
    ;;
  draft)
    TITLE="PR en brouillon"; ACTION="Draft"; COLOR=$ORANGE
    TAGS=("work in progress" "wip" "working" "typing")
    MSG="📝 $AUTHOR_MENTION a passé la PR #$PR_NUMBER en brouillon."
    ;;
  
  *) echo "STATUS inconnu: $STATUS" >&2; exit 1 ;;
esac

# Échappement JSON robuste
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# Sélection aléatoire d'un tag et récupération d'un GIF
RANDOM_TAG="${TAGS[$RANDOM % ${#TAGS[@]}]}"
QUERY=$(printf "%s" "$RANDOM_TAG" | sed 's/ /+/g')
echo "🔍 Recherche GIF avec tag: $RANDOM_TAG" >&2

GIF_JSON=$(curl -fsS "https://api.giphy.com/v1/gifs/random?api_key=${GIPHY_API_KEY}&tag=${QUERY}&rating=g" 2>/dev/null || echo '{}')
GIF_URL=""

if command -v jq &> /dev/null; then
  GIF_URL=$(echo "$GIF_JSON" | jq -r '.data.images.original.url // .data.images.fixed_height.url // empty' 2>/dev/null || echo "")
else
  GIF_URL=$(echo "$GIF_JSON" | grep -oP '"original":\s*\{[^}]*"url":\s*"\K[^"]+' | head -n1 || echo "")
  if [ -z "$GIF_URL" ]; then
    GIF_URL=$(echo "$GIF_JSON" | grep -oP '"fixed_height":\s*\{[^}]*"url":\s*"\K[^"]+' | head -n1 || echo "")
  fi
fi

if [ -n "$GIF_URL" ]; then
  echo "✅ GIF trouvé: $GIF_URL" >&2
else
  echo "⚠️  Aucun GIF trouvé" >&2
fi

# Échappe toutes les valeurs
E_MSG=$(json_escape "$MSG")
E_TITLE=$(json_escape "$TITLE")
E_ACTION=$(json_escape "$ACTION")
E_PR_TITLE=$(json_escape "$PR_TITLE")
E_PR_URL=$(json_escape "$PR_URL")
E_REPO_FULL_NAME=$(json_escape "$REPO_FULL_NAME")
E_REPO_URL=$(json_escape "$REPO_URL")
E_TIMESTAMP=$(json_escape "$TIMESTAMP")
E_DESCRIPTION=$(json_escape "$DESCRIPTION")
E_GIF_URL=$(json_escape "$GIF_URL")
E_PR_AUTHOR_LOGIN=$(json_escape "$PR_AUTHOR_LOGIN")
E_PR_AUTHOR_AVATAR=$(json_escape "$PR_AUTHOR_AVATAR")
E_ACTOR_LOGIN=$(json_escape "$ACTOR_LOGIN")
E_ACTOR_AVATAR=$(json_escape "$ACTOR_AVATAR")

# Construction des champs
FIELDS='[
  { "name": "👤 Auteur", "value": "['$E_PR_AUTHOR_LOGIN'](https://github.com/'$E_PR_AUTHOR_LOGIN')", "inline": true }'

# Ajoute l'acteur seulement si différent de l'auteur (pour reviews, merge, close)
if [ "$ACTOR_LOGIN" != "$PR_AUTHOR_LOGIN" ]; then
  FIELDS="$FIELDS"',
  { "name": "👁️ Acteur", "value": "['$E_ACTOR_LOGIN'](https://github.com/'$E_ACTOR_LOGIN')", "inline": true }'
fi

FIELDS="$FIELDS"',
  { "name": "📋 Repository", "value": "['$E_REPO_FULL_NAME']('$E_REPO_URL')", "inline": false }'

if [ -n "$DESCRIPTION" ]; then
  # Tronque la description si trop longue
  DESC_TRUNCATED="${DESCRIPTION:0:200}"
  if [ ${#DESCRIPTION} -gt 200 ]; then
    DESC_TRUNCATED="${DESC_TRUNCATED}..."
  fi
  E_DESC_TRUNCATED=$(json_escape "$DESC_TRUNCATED")
  FIELDS="$FIELDS"',
  { "name": "📜 Description", "value": "'"$E_DESC_TRUNCATED"'", "inline": false }'
fi

FIELDS="$FIELDS"']'

# Image GIF
IMAGE_BLOCK='null'
if [ -n "$GIF_URL" ] && [ "$GIF_URL" != "null" ]; then
  IMAGE_BLOCK='{ "url": "'$E_GIF_URL'" }'
fi

# Mentions Discord (uniquement ceux trouvés)
ALLOWED_USERS="[]"
if [ "$AUTHOR_FOUND" = "true" ] && [ -n "$TARGET_DISCORD_ID" ]; then
  ALLOWED_USERS='["'$TARGET_DISCORD_ID'"]'
fi

# Construction du payload avec jq
PAYLOAD=$(jq -n \
  --arg content "$E_MSG" \
  --arg title "$E_TITLE" \
  --arg action "$E_ACTION" \
  --arg pr_title "$E_PR_TITLE" \
  --arg pr_url "$E_PR_URL" \
  --argjson color "$COLOR" \
  --arg actor_login "$E_ACTOR_LOGIN" \
  --arg actor_avatar "$E_ACTOR_AVATAR" \
  --arg repo_name "$E_REPO_FULL_NAME" \
  --arg timestamp "$E_TIMESTAMP" \
  --argjson fields "$FIELDS" \
  --argjson image "$IMAGE_BLOCK" \
  --argjson allowed_users "$ALLOWED_USERS" \
  '{
    username: "Corevia",
    avatar_url: "https://raw.githubusercontent.com/ESP-Corevia/.github/master/.github/assets/logo.png",
    content: $content,
    embeds: [{
      title: ("🔔 " + $title),
      description: ("**Action:** `" + $action + "`\n\n📦 **PR:** [" + $pr_title + "](" + $pr_url + ")"),
      url: $pr_url,
      color: $color,
      author: {
        name: $actor_login,
        url: ("https://github.com/" + $actor_login),
        icon_url: $actor_avatar
      },
      fields: $fields,
      footer: {
        text: ("Repo: " + $repo_name),
        icon_url: "https://i.imgur.com/YourCoreviaLogo.png"
      },
      timestamp: $timestamp,
      image: $image
    }],
    allowed_mentions: {
      parse: [],
      users: $allowed_users
    }
  }')

# Debug
echo "=== PAYLOAD ===" >&2
echo "$PAYLOAD" | jq '.' >&2
echo "===============" >&2

# Envoi vers Discord
curl -fsSL -H "Content-Type: application/json" -X POST -d "$PAYLOAD" "$WEBHOOK_URL"
echo ""
echo "✅ Notification Discord envoyée avec succès"
