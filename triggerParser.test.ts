import { TriggerParser } from '../../src/parsers/triggerParser';

describe('TriggerParser', () => {
  let parser: TriggerParser;

  beforeEach(() => {
    parser = new TriggerParser();
  });

  describe('parseFile', () => {
    it('should parse a trigger declaration', async () => {
      const source = `
        trigger AccountTrigger on Account (before insert, after update, before delete) {
          AccountTriggerHandler.handle(Trigger.operationType, Trigger.new, Trigger.old);
        }
      `;

      const { node, edges } = await parser.parseFile('/mock/AccountTrigger.trigger', source);

      expect(node.id).toBe('trigger:AccountTrigger');
      expect(node.type).toBe('apex-trigger');
      expect(node.metadata.annotations).toContain('before insert');
      expect(node.metadata.annotations).toContain('after update');
      expect(node.metadata.annotations).toContain('before delete');
    });

    it('should create edge to SObject', async () => {
      const source = `
        trigger OpportunityTrigger on Opportunity (after insert) {
        }
      `;

      const { edges } = await parser.parseFile('/mock/OpportunityTrigger.trigger', source);

      const sobjectEdge = edges.find(e => e.type === 'trigger-object');
      expect(sobjectEdge).toBeDefined();
      expect(sobjectEdge!.target).toBe('sobject:Opportunity');
    });

    it('should detect handler class references via static calls', async () => {
      const source = `
        trigger ContactTrigger on Contact (before insert, after insert) {
          if (Trigger.isBefore) {
            ContactValidator.validate(Trigger.new);
          }
          if (Trigger.isAfter) {
            ContactNotifier.sendNotifications(Trigger.new);
          }
        }
      `;

      const { edges } = await parser.parseFile('/mock/ContactTrigger.trigger', source);

      const staticCalls = edges.filter(e => e.type === 'static-call');
      const targets = staticCalls.map(e => e.target);
      expect(targets).toContain('apex:ContactValidator');
      expect(targets).toContain('apex:ContactNotifier');
    });

    it('should detect handler class instantiation', async () => {
      const source = `
        trigger CaseTrigger on Case (after update) {
          CaseHandler handler = new CaseHandler();
          handler.processUpdates(Trigger.new, Trigger.oldMap);
        }
      `;

      const { edges } = await parser.parseFile('/mock/CaseTrigger.trigger', source);

      const instantiations = edges.filter(e => e.type === 'instantiates');
      expect(instantiations.map(e => e.target)).toContain('apex:CaseHandler');
    });

    it('should not create edges for built-in types', async () => {
      const source = `
        trigger SimpleTrigger on Account (before insert) {
          System.debug('trigger fired');
          List<Account> accs = Trigger.new;
        }
      `;

      const { edges } = await parser.parseFile('/mock/SimpleTrigger.trigger', source);

      const targets = edges.map(e => e.target);
      expect(targets).not.toContain('apex:System');
      expect(targets).not.toContain('apex:Trigger');
      expect(targets).not.toContain('apex:List');
    });
  });
});
