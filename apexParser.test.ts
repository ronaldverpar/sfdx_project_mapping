import { ApexParser } from '../../src/parsers/apexParser';
import { workspace } from 'vscode';

// Mock workspace.fs.readFile to return our test content
const mockReadFile = workspace.fs.readFile as jest.Mock;

describe('ApexParser', () => {
  let parser: ApexParser;

  beforeEach(() => {
    parser = new ApexParser();
    jest.clearAllMocks();
  });

  describe('parseFile', () => {
    it('should parse a simple Apex class', async () => {
      const source = `
        public with sharing class AccountService {
          public List<Account> getAccounts() {
            return [SELECT Id FROM Account];
          }
        }
      `;

      const { node, edges } = await parser.parseFile('/mock/AccountService.cls', source);

      expect(node.id).toBe('apex:AccountService');
      expect(node.name).toBe('AccountService');
      expect(node.type).toBe('apex-class');
      expect(node.metadata.sharingModel).toBe('with sharing');
      expect(node.metadata.isTest).toBe(false);
      expect(node.metadata.isAbstract).toBe(false);
    });

    it('should detect extends relationships', async () => {
      const source = `
        public class MyService extends BaseService {
          public void doWork() {}
        }
      `;

      const { node, edges } = await parser.parseFile('/mock/MyService.cls', source);

      expect(node.metadata.superClass).toBe('BaseService');
      const extendsEdge = edges.find(e => e.type === 'extends');
      expect(extendsEdge).toBeDefined();
      expect(extendsEdge!.target).toBe('apex:BaseService');
    });

    it('should detect implements relationships', async () => {
      const source = `
        public class MyBatch implements Database.Batchable<SObject>, Schedulable {
          public void execute(Database.BatchableContext bc, List<SObject> scope) {}
        }
      `;

      const { node, edges } = await parser.parseFile('/mock/MyBatch.cls', source);

      expect(node.metadata.interfaces).toContain('Database.Batchable<SObject>');
      expect(node.metadata.interfaces).toContain('Schedulable');

      const implEdges = edges.filter(e => e.type === 'implements');
      expect(implEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect new ClassName() instantiations', async () => {
      const source = `
        public class OrderProcessor {
          public void process() {
            EmailHelper helper = new EmailHelper();
            AccountValidator validator = new AccountValidator();
            helper.send();
          }
        }
      `;

      const { edges } = await parser.parseFile('/mock/OrderProcessor.cls', source);

      const instantiations = edges.filter(e => e.type === 'instantiates');
      const targets = instantiations.map(e => e.target);
      expect(targets).toContain('apex:EmailHelper');
      expect(targets).toContain('apex:AccountValidator');
    });

    it('should detect static method calls', async () => {
      const source = `
        public class ReportGenerator {
          public void generate() {
            List<Account> accs = AccountUtils.getActiveAccounts();
            Logger.info('Generated report');
          }
        }
      `;

      const { edges } = await parser.parseFile('/mock/ReportGenerator.cls', source);

      const staticCalls = edges.filter(e => e.type === 'static-call');
      const targets = staticCalls.map(e => e.target);
      expect(targets).toContain('apex:AccountUtils');
      expect(targets).toContain('apex:Logger');
    });

    it('should detect type references', async () => {
      const source = `
        public class ContactController {
          public ContactDTO dto;
          public ValidationResult validate() {
            return null;
          }
        }
      `;

      const { edges } = await parser.parseFile('/mock/ContactController.cls', source);

      const typeRefs = edges.filter(e => e.type === 'type-reference');
      const targets = typeRefs.map(e => e.target);
      expect(targets).toContain('apex:ContactDTO');
    });

    it('should detect generic type parameters', async () => {
      const source = `
        public class DataProcessor {
          public List<CustomWrapper> wrappers;
          public Map<String, AccountDTO> dtoMap;
        }
      `;

      const { edges } = await parser.parseFile('/mock/DataProcessor.cls', source);

      const targets = edges.map(e => e.target);
      expect(targets).toContain('apex:CustomWrapper');
      expect(targets).toContain('apex:AccountDTO');
    });

    it('should detect @IsTest classes', async () => {
      const source = `
        @IsTest
        private class AccountServiceTest {
          @IsTest
          static void testGetAccounts() {
            // test
          }
        }
      `;

      const { node } = await parser.parseFile('/mock/AccountServiceTest.cls', source);

      expect(node.metadata.isTest).toBe(true);
      expect(node.metadata.annotations).toContain('@IsTest');
    });

    it('should detect abstract and virtual classes', async () => {
      const abstractSource = `
        public abstract class BaseHandler {
          public abstract void handle();
        }
      `;

      const virtualSource = `
        public virtual class BaseController {
          public virtual void init() {}
        }
      `;

      const { node: abstractNode } = await parser.parseFile('/mock/BaseHandler.cls', abstractSource);
      const { node: virtualNode } = await parser.parseFile('/mock/BaseController.cls', virtualSource);

      expect(abstractNode.metadata.isAbstract).toBe(true);
      expect(virtualNode.metadata.isVirtual).toBe(true);
    });

    it('should detect interfaces', async () => {
      const source = `
        public interface IAccountService {
          List<Account> getAccounts();
          void updateAccount(Account acc);
        }
      `;

      const { node } = await parser.parseFile('/mock/IAccountService.cls', source);

      expect(node.type).toBe('apex-interface');
    });

    it('should detect annotations', async () => {
      const source = `
        @RestResource(urlMapping='/api/accounts/*')
        global class AccountRestService {
          @HttpGet
          global static List<Account> getAccounts() {
            return null;
          }
          @HttpPost
          global static void createAccount() {}
        }
      `;

      const { node } = await parser.parseFile('/mock/AccountRestService.cls', source);

      expect(node.metadata.annotations).toContain('@RestResource');
      expect(node.metadata.annotations).toContain('@HttpGet');
      expect(node.metadata.annotations).toContain('@HttpPost');
    });

    it('should not create edges for built-in types', async () => {
      const source = `
        public class SimpleClass {
          public String name;
          public Integer count;
          public List<String> items;
          public Map<String, Object> data;
        }
      `;

      const { edges } = await parser.parseFile('/mock/SimpleClass.cls', source);

      const targets = edges.map(e => e.target);
      expect(targets).not.toContain('apex:String');
      expect(targets).not.toContain('apex:Integer');
      expect(targets).not.toContain('apex:List');
      expect(targets).not.toContain('apex:Map');
    });

    it('should ignore references inside comments and strings', async () => {
      const source = `
        public class CleanClass {
          // FakeClass.doSomething();
          /* new FakeClass(); */
          public void run() {
            String msg = 'FakeClass is mentioned here';
          }
        }
      `;

      const { edges } = await parser.parseFile('/mock/CleanClass.cls', source);

      const targets = edges.map(e => e.target);
      expect(targets).not.toContain('apex:FakeClass');
    });

    it('should deduplicate edges', async () => {
      const source = `
        public class Caller {
          public void a() { Helper.run(); }
          public void b() { Helper.run(); }
          public void c() { Helper.execute(); }
        }
      `;

      const { edges } = await parser.parseFile('/mock/Caller.cls', source);

      const helperStaticCalls = edges.filter(
        e => e.target === 'apex:Helper' && e.type === 'static-call'
      );
      // Should be deduplicated to 1 edge
      expect(helperStaticCalls.length).toBe(1);
    });
  });
});
