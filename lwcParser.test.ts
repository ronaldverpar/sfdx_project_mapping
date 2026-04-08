import { LwcParser } from '../../src/parsers/lwcParser';
import { workspace } from 'vscode';

const mockReadFile = workspace.fs.readFile as jest.Mock;

describe('LwcParser', () => {
  let parser: LwcParser;

  beforeEach(() => {
    parser = new LwcParser();
    jest.clearAllMocks();
  });

  /**
   * Helper: mock vscode.workspace.fs.readFile to return specific content
   * based on file path patterns.
   */
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
    it('should detect Apex imports in JS', async () => {
      mockFiles({
        'myComponent.js': `
          import getAccounts from '@salesforce/apex/AccountController.getAccounts';
          import saveRecord from '@salesforce/apex/RecordService.save';
          export default class MyComponent extends LightningElement {}
        `,
        'myComponent.html': '<template></template>',
        'myComponent.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { node, edges } = await parser.parseComponent(
        '/mock/lwc/myComponent/myComponent.js'
      );

      expect(node.id).toBe('lwc:myComponent');
      expect(node.type).toBe('lwc');

      const apexImports = edges.filter(e => e.type === 'apex-import');
      expect(apexImports.length).toBe(2);
      expect(apexImports.map(e => e.target)).toContain('apex:AccountController');
      expect(apexImports.map(e => e.target)).toContain('apex:RecordService');
    });

    it('should detect LWC child composition in HTML', async () => {
      mockFiles({
        'parentComponent.js': `
          export default class ParentComponent extends LightningElement {}
        `,
        'parentComponent.html': `
          <template>
            <c-child-header title="Hello"></c-child-header>
            <div class="body">
              <c-data-table records={records}></c-data-table>
              <c-action-bar></c-action-bar>
            </div>
          </template>
        `,
        'parentComponent.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { edges } = await parser.parseComponent(
        '/mock/lwc/parentComponent/parentComponent.js'
      );

      const compositions = edges.filter(e => e.type === 'lwc-composition');
      const targets = compositions.map(e => e.target);

      expect(targets).toContain('lwc:childHeader');
      expect(targets).toContain('lwc:dataTable');
      expect(targets).toContain('lwc:actionBar');
    });

    it('should detect LWC JS imports (c/childComponent)', async () => {
      mockFiles({
        'wrapper.js': `
          import ChildComponent from 'c/childComponent';
          import { someUtil } from 'c/sharedUtils';
          export default class Wrapper extends LightningElement {}
        `,
        'wrapper.html': '<template></template>',
        'wrapper.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { edges } = await parser.parseComponent(
        '/mock/lwc/wrapper/wrapper.js'
      );

      const lwcImports = edges.filter(e => e.type === 'lwc-composition');
      expect(lwcImports.map(e => e.target)).toContain('lwc:childComponent');
      expect(lwcImports.map(e => e.target)).toContain('lwc:sharedUtils');
    });

    it('should detect @wire adapters', async () => {
      mockFiles({
        'recordView.js': `
          import { LightningElement, wire } from 'lwc';
          import { getRecord } from 'lightning/uiRecordApi';
          import getContacts from '@salesforce/apex/ContactController.getContacts';

          export default class RecordView extends LightningElement {
            @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
            record;

            @wire(getContacts, { accountId: '$accountId' })
            contacts;
          }
        `,
        'recordView.html': '<template></template>',
        'recordView.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { node, edges } = await parser.parseComponent(
        '/mock/lwc/recordView/recordView.js'
      );

      expect(node.metadata.wireAdapters).toContain('getRecord');
      expect(node.metadata.wireAdapters).toContain('getContacts');

      const wireEdges = edges.filter(e => e.type === 'wire-adapter');
      expect(wireEdges.length).toBe(2);
    });

    it('should extract @api properties', async () => {
      mockFiles({
        'customCard.js': `
          import { LightningElement, api } from 'lwc';
          export default class CustomCard extends LightningElement {
            @api recordId;
            @api title;
            @api get isActive() { return this._active; }
          }
        `,
        'customCard.html': '<template></template>',
        'customCard.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { node } = await parser.parseComponent(
        '/mock/lwc/customCard/customCard.js'
      );

      expect(node.metadata.apiProperties).toContain('recordId');
      expect(node.metadata.apiProperties).toContain('title');
      expect(node.metadata.apiProperties).toContain('isActive');
    });

    it('should extract XML meta: isExposed and targets', async () => {
      mockFiles({
        'appCard.js': `
          export default class AppCard extends LightningElement {}
        `,
        'appCard.html': '<template></template>',
        'appCard.js-meta.xml': `
          <?xml version="1.0" encoding="UTF-8"?>
          <LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
            <apiVersion>58.0</apiVersion>
            <isExposed>true</isExposed>
            <targets>
              <target>lightning__RecordPage</target>
              <target>lightning__AppPage</target>
              <target>lightning__HomePage</target>
            </targets>
          </LightningComponentBundle>
        `,
      });

      const { node } = await parser.parseComponent(
        '/mock/lwc/appCard/appCard.js'
      );

      expect(node.metadata.isExposed).toBe(true);
      expect(node.metadata.targets).toContain('lightning__RecordPage');
      expect(node.metadata.targets).toContain('lightning__AppPage');
      expect(node.metadata.targets).toContain('lightning__HomePage');
    });

    it('should convert kebab-case to camelCase for child components', async () => {
      mockFiles({
        'testParent.js': 'export default class TestParent extends LightningElement {}',
        'testParent.html': `
          <template>
            <c-my-complex-component-name></c-my-complex-component-name>
          </template>
        `,
        'testParent.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { edges } = await parser.parseComponent(
        '/mock/lwc/testParent/testParent.js'
      );

      const compositions = edges.filter(e => e.type === 'lwc-composition');
      expect(compositions.map(e => e.target)).toContain('lwc:myComplexComponentName');
    });

    it('should deduplicate child component references', async () => {
      mockFiles({
        'listView.js': 'export default class ListView extends LightningElement {}',
        'listView.html': `
          <template>
            <template for:each={items} for:item="item">
              <c-list-item key={item.id}></c-list-item>
            </template>
            <c-list-item></c-list-item>
          </template>
        `,
        'listView.js-meta.xml': '<LightningComponentBundle></LightningComponentBundle>',
      });

      const { edges } = await parser.parseComponent(
        '/mock/lwc/listView/listView.js'
      );

      const listItemEdges = edges.filter(e => e.target === 'lwc:listItem');
      expect(listItemEdges.length).toBe(1);
    });
  });
});
