import { ticketsService } from '../src/modules/tickets/tickets.service.js';

const ids = ['f82e525f-291c-4c8f-87d2-c83d9eb5d2bc', 'c3c43a87-cb05-41d2-8ab8-d740e1448ed9'];
for (const id of ids) {
  try {
    await ticketsService.generateTickets(id);
    console.log('Generated tickets for', id);
  } catch (e) {
    console.error('Failed', id, (e as Error).message);
  }
}
process.exit(0);
