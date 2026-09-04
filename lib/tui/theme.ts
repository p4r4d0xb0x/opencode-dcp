import type { Theme, TuiApi, TuiContext } from "./types"

/** Map OpenCode 2 semantic theme tokens onto the flat palette used by the dialogs. */
export function flattenTheme(theme: TuiContext["theme"]): Theme {
    return {
        primary: theme.text.action.primary.default,
        secondary: theme.text.action.secondary.default,
        accent: theme.text.action.primary.default,
        text: theme.text.default,
        textMuted: theme.text.subdued,
        background: theme.background.default,
        backgroundElement: theme.background.surface.offset,
        borderSubtle: theme.border.default,
        selectedListItemText: theme.text.action.primary.selected,
        success: theme.text.feedback.success.default,
        warning: theme.text.feedback.warning.default,
        error: theme.text.feedback.error.default,
        info: theme.text.feedback.info.default,
    }
}

export function createTuiApi(context: TuiContext): TuiApi {
    return {
        context,
        theme: {
            get current() {
                return flattenTheme(context.theme)
            },
        },
        ui: {
            dialog: {
                clear: () => context.ui.dialog.clear(),
            },
        },
    }
}
