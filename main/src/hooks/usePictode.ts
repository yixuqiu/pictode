import { Ref, ref } from 'vue';
import { App, Konva, KonvaNode } from '@pictode/core';
import HistoryPlugin from '@pictode/plugin-history';
import SelectorPlugin from '@pictode/plugin-selector';
import { useCommandComponent } from '@pictode/vue-aide';

import MessageBox from '@/components/MessageBox.vue';
import { FormConfig, FormValue } from '@/form';
import { getPanelConfigByShape, getPanelConfigByTool } from '@/panels';
import ContextMenu from '@/view/canvas/components/ContextMenu.vue';

const app = new App();

const historyPlugin = new HistoryPlugin({
  enable: true,
  stackSize: 50,
});

const selectorPlugin = new SelectorPlugin({
  enable: true,
  multipleSelect: true,
});

app.use(historyPlugin);
app.use(selectorPlugin);

const selected: Ref<Array<KonvaNode>> = ref([]);
const panelFormConfig = ref<FormConfig>([]);
const panelFormModel = ref<FormValue>({});

app.on('selected:changed', ({ selected: newSelected }) => {
  selected.value = newSelected;
  if (app.curTool?.name !== 'selectTool') {
    return;
  }
  const newPanelConfig = getPanelConfigByShape(newSelected[0]?.className ?? '');
  panelFormConfig.value = newPanelConfig?.formConfig ?? [];
  if (newPanelConfig?.model) {
    newPanelConfig.model = Object.keys(newPanelConfig.model).reduce(
      (model, key) => ({
        ...model,
        [key]: selected.value?.[0].attrs[key],
      }),
      {}
    );
  }
  panelFormModel.value = newPanelConfig?.model ?? {};
});

app.on('tool:changed', ({ curTool }) => {
  const newPanelConfig = getPanelConfigByTool(curTool.name);
  if (!newPanelConfig) {
    return;
  }
  panelFormConfig.value = newPanelConfig.formConfig;
  panelFormModel.value = newPanelConfig.model;
  curTool.config = panelFormModel.value;
});

const contextMenu = useCommandComponent(ContextMenu);
const messageBox = useCommandComponent(MessageBox);
app.on('mouse:contextmenu', ({ event }) => {
  event.evt.preventDefault();
  const shapeLayerMenus = selected.value.length
    ? [
        {
          label: '上移一层',
          action: () => {
            app.moveUp(...selected.value);
          },
        },
        {
          label: '下移一层',
          action: () => {
            app.moveDown(...selected.value);
          },
        },
        {
          label: '置于顶层',
          action: () => {
            app.moveTop(...selected.value);
          },
        },
        {
          label: '置于底层',
          action: () => {
            app.moveBottom(...selected.value);
          },
        },
      ]
    : [];
  const shapeDeleteMenus = selected.value.length
    ? [
        {
          label: '删除',
          action: () => {
            app.remove(...selected.value);
          },
        },
      ]
    : [];
  const targetIsStage = event.target instanceof Konva.Stage;
  const stageMenus =
    targetIsStage || selected.value.length === 0
      ? [
          {
            label: '全部选中',
            action: () => {
              app.selectAll();
            },
          },
          {
            label: '重置画布',
            action: () => {
              messageBox({
                title: '清除画布',
                message: '将会清空画布内容，是否继续？',
                onSubmit: () => {
                  app.clear();
                  messageBox.close();
                },
              });
            },
          },
        ]
      : [];
  const historyMenus = [
    {
      label: '撤销',
      disable: !app.canUndo(),
      action: () => {
        app.undo();
      },
    },
    {
      label: '重做',
      disable: !app.canRedo(),
      action: () => {
        app.redo();
      },
    },
  ];
  const menuGroups = [stageMenus, shapeLayerMenus, historyMenus, shapeDeleteMenus];

  contextMenu({
    x: event.evt.clientX,
    y: event.evt.clientY,
    menuGroups,
  });
});

export const usePictode = () => {
  return {
    app,
    selected,
    panelFormConfig,
    panelFormModel,
  };
};

export default usePictode;
