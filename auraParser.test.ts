import { AuraParser } from '../../src/parsers/auraParser';
import { workspace } from 'vscode';

const mockReadFile = workspace.fs.readFile as jest.Mock;

describe('AuraParser', () => {
  let parser: AuraParser;

  beforeEach(() => {
    parser = new AuraParser();
    jest.clearAllMocks();
  });

  function mockFiles(files: Record<string, string>) {
    mockReadFile.mockImplementation((uri: any) => {
      const path = uri.fsPath || uri.path || uri;
      for (const [pattern, content] of Object.entries(files)) {
        if (path.includes(pattern)) {
          return Promise.resolve(Buffer.from(content));
        }
      }
      return Promise.reject(new Error(`File not found: ${path}`));
    });
  }

  describe('parseComponent', () => {
    it('should detect Apex controller binding', async () => {
      mockFiles({
        'myAuraComp.cmp': `
          <aura:component controller="AccountController"
                          implements="flexipage:availableForAllPageTypes">
            <aura:attribute name="accounts" type="List" />
          </aura:component>
        `,
        'myAuraCompController.js': `({
          doInit: function(component, event, helper) {
            var action = component.get("c.getAccounts");
            action.setCallback(this, function(response) {});
            $A.enqueueAction(action);
          }
        })`,
        'myAuraCompHelper.js': '',
        'myAuraComp.design': '<design:component></design:component>',
      });

      const { node, edges } = await parser.parseComponent(
        '/mock/aura/myAuraComp/myAuraComp.cmp'
      );

      expect(node.id).toBe('aura:myAuraComp');
      expect(node.type).toBe('aura');
      expect(node.metadata.superClass).toBe('AccountController');

      const apexEdge = edges.find(e => e.type === 'apex-import');
      expect(apexEdge).toBeDefined();
      expect(apexEdge!.target).toBe('apex:AccountController');
    });

    it('should detect child component composition (<c:ChildComponent>)', async () => {
      mockFiles({
        'parentAura.cmp': `
          <aura:component>
            <c:HeaderBar title="Test" />
            <c:DataGrid records="{!v.records}" />
            <c:FooterBar />
          </aura:component>
        `,
        'parentAuraController.js': '({})',
        'parentAuraHelper.js': '',
        'parentAura.design': '',
      });

      const { edges } = await parser.parseComponent(
        '/mock/aura/parentAura/parentAura.cmp'
      );

      const compositions = edges.filter(e => e.type === 'lwc-composition');
      const targets = compositions.map(e => e.target);
      expect(targets).toContain('aura:HeaderBar');
      expect(targets).toContain('aura:DataGrid');
      expect(targets).toContain('aura:FooterBar');
    });

    it('should detect <aura:dependency> references', async () => {
      mockFiles({
        'dynamicLoader.cmp': `
          <aura:component>
            <aura:dependency resource="markup://c:DynamicPanel" />
            <aura:dependency resource="markup://c:ErrorDialog" />
          </aura:component>
        `,
        'dynamicLoaderController.js': '({})',
        'dynamicLoaderHelper.js': '',
        'dynamicLoader.design': '',
      });

      const { edges } = await parser.parseComponent(
        '/mock/aura/dynamicLoader/dynamicLoader.cmp'
      );

      const compositions = edges.filter(e => e.type === 'lwc-composition');
      const targets = compositions.map(e => e.target);
      expect(targets).toContain('aura:DynamicPanel');
      expect(targets).toContain('aura:ErrorDialog');
    });

    it('should detect $A.createComponent in JS', async () => {
      mockFiles({
        'creator.cmp': '<aura:component></aura:component>',
        'creatorController.js': `({
          handleClick: function(cmp, event, helper) {
            $A.createComponent("c:ModalDialog", { title: "Hello" }, function(newCmp) {});
          }
        })`,
        'creatorHelper.js': `({
          openPanel: function() {
            $A.createComponents([
              ["c:PanelHeader", {}],
              ["c:PanelBody", {}]
            ], function() {});
          }
        })`,
        'creator.design': '',
      });

      const { edges } = await parser.parseComponent(
        '/mock/aura/creator/creator.cmp'
      );

      const instantiations = edges.filter(e => e.type === 'instantiates');
      const targets = instantiations.map(e => e.target);
      expect(targets).toContain('aura:ModalDialog');
    });

    it('should detect event references', async () => {
      mockFiles({
        'eventFirer.cmp': '<aura:component></aura:component>',
        'eventFirerController.js': `({
          fireEvent: function(cmp) {
            var evt = $A.get("e.c:RecordUpdated");
            evt.setParams({ recordId: "001xxx" });
            evt.fire();
          }
        })`,
        'eventFirerHelper.js': '',
        'eventFirer.design': '',
      });

      const { edges } = await parser.parseComponent(
        '/mock/aura/eventFirer/eventFirer.cmp'
      );

      const eventRefs = edges.filter(e => e.target.startsWith('aura-event:'));
      expect(eventRefs.length).toBe(1);
      expect(eventRefs[0].target).toBe('aura-event:RecordUpdated');
    });

    it('should extract interfaces from implements attribute', async () => {
      mockFiles({
        'pageComp.cmp': `
          <aura:component implements="flexipage:availableForAllPageTypes,force:hasRecordId,force:appHostable">
          </aura:component>
        `,
        'pageCompController.js': '({})',
        'pageCompHelper.js': '',
        'pageComp.design': '',
      });

      const { node } = await parser.parseComponent(
        '/mock/aura/pageComp/pageComp.cmp'
      );

      expect(node.metadata.interfaces).toContain('flexipage:availableForAllPageTypes');
      expect(node.metadata.interfaces).toContain('force:hasRecordId');
      expect(node.metadata.interfaces).toContain('force:appHostable');
    });

    it('should extract aura:attribute names', async () => {
      mockFiles({
        'attrComp.cmp': `
          <aura:component>
            <aura:attribute name="recordId" type="String" />
            <aura:attribute name="title" type="String" default="Default" />
            <aura:attribute name="items" type="List" />
          </aura:component>
        `,
        'attrCompController.js': '({})',
        'attrCompHelper.js': '',
        'attrComp.design': '',
      });

      const { node } = await parser.parseComponent(
        '/mock/aura/attrComp/attrComp.cmp'
      );

      expect(node.metadata.apiProperties).toContain('recordId');
      expect(node.metadata.apiProperties).toContain('title');
      expect(node.metadata.apiProperties).toContain('items');
    });

    it('should detect design file for isExposed', async () => {
      mockFiles({
        'exposed.cmp': '<aura:component></aura:component>',
        'exposedController.js': '({})',
        'exposedHelper.js': '',
        'exposed.design': '<design:component><design:attribute name="title" /></design:component>',
      });

      const { node: exposedNode } = await parser.parseComponent(
        '/mock/aura/exposed/exposed.cmp'
      );

      expect(exposedNode.metadata.isExposed).toBe(true);
    });
  });
});
