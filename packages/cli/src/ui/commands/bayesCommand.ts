/**
 * bayesCommand - selects a model via an internal Bayesian selector
 */
import { SlashCommand } from './types.js';

export const bayesCommand: SlashCommand = {
  name: 'bayes-select',
  description: 'Run Bayesian model selection for a prompt and choose the best model',
  action: async (context, args) => {
    const prompt = args || '';
    // The TUI attaches a `ui` object into context in CommandService's execution path.
    // We attempt to detect the BlessedTui instance via context.ui.addItem being present.
    if (!context || !context.ui || typeof (context.ui as any).runBayesSelection !== 'function') {
      return { type: 'message', messageType: 'error', content: 'Bayes selector not available in this environment.' };
    }
    try {
      const result = await (context.ui as any).runBayesSelection(prompt);
      return {
        type: 'message',
        messageType: 'info',
        content: `Bayes selected model: ${result.bestModel} (score=${result.bestScore.toFixed(3)})`,
      };
    } catch (err) {
      return { type: 'message', messageType: 'error', content: `Bayes selection failed: ${String(err)}` };
    }
  },
};
