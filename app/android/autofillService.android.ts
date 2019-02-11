import { AutofillHelpers } from './autofill/autofillHelpers';
import { FilledItem } from './autofill/filledItem';
import { Parser } from './autofill/parser';

import { Utils } from 'jslib/misc/utils';

import { ServiceContainer } from '../../services/serviceContainer';

import { CipherService } from 'jslib/abstractions/cipher.service';
import { I18nService } from 'jslib/abstractions/i18n.service';
import { LockService } from 'jslib/abstractions/lock.service';
import { CipherType } from 'jslib/enums';

declare let com: any;

@JavaProxy('com.tns.AutofillService')
export class AutofillService extends android.service.autofill.AutofillService {
    private cipherService: CipherService;
    private lockService: LockService;
    private i18nService: I18nService;

    async onFillRequest(request: android.service.autofill.FillRequest,
        cancellationSignal: android.os.CancellationSignal, callback: android.service.autofill.FillCallback) {
        const fillContext = request.getFillContexts();
        if (fillContext == null) {
            return;
        }
        const lastContext: android.service.autofill.FillContext = fillContext.get(fillContext.size() - 1);
        if (lastContext == null) {
            return;
        }
        const structure = lastContext.getStructure();
        if (structure == null) {
            return;
        }

        const parser = new Parser(structure, this.getApplicationContext());
        parser.parse();

        if (!parser.shouldAutofill) {
            return;
        }

        const serviceContainer: ServiceContainer = (this.getApplicationContext() as any).serviceContainer;
        if (this.lockService == null) {
            this.lockService = serviceContainer.resolve<LockService>('lockService');
        }

        if (this.i18nService == null) {
            this.i18nService = serviceContainer.resolve<I18nService>('i18nService');
        }

        let items: FilledItem[] = null;
        const locked = true; // TODO
        if (!locked) {
            if (this.cipherService == null) {
                this.cipherService = serviceContainer.resolve<CipherService>('cipherService');
            }
            items = await AutofillHelpers.getFillItems(parser, this.cipherService);
        }

        // build response
        const response = AutofillHelpers.buildFillResponse(parser, items, locked, this.i18nService);
        callback.onSuccess(response);
    }

    onSaveRequest(request: android.service.autofill.SaveRequest, callback: android.service.autofill.SaveCallback) {
        const fillContext = request.getFillContexts();
        if (fillContext == null) {
            return;
        }
        const lastContext: android.service.autofill.FillContext = fillContext.get(fillContext.size() - 1);
        if (lastContext == null) {
            return;
        }
        const structure = lastContext.getStructure();
        if (structure == null) {
            return;
        }

        const parser = new Parser(structure, this.getApplicationContext());
        parser.parse();

        const savedItem = parser.fieldCollection.getSavedItem();
        if (savedItem == null) {
            android.widget.Toast.makeText(this.getApplicationContext(), 'Unable to save this form.',
                android.widget.Toast.LENGTH_SHORT).show();
            return;
        }

        const intent = new android.content.Intent(this.getApplicationContext(), com.tns.MainActivity.class);
        intent.setFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra('autofillFramework', true);
        intent.putExtra('autofillFrameworkSave', true);
        intent.putExtra('autofillFrameworkType', savedItem.type);
        switch (savedItem.type) {
            case CipherType.Login:
                const cleanUri = parser.uri.replace('androidapp://', '').replace('https://', '').replace('http://', '');
                intent.putExtra('autofillFrameworkName', cleanUri);
                intent.putExtra('autofillFrameworkUri', parser.uri);
                intent.putExtra('autofillFrameworkUsername', savedItem.login.username);
                intent.putExtra('autofillFrameworkPassword', savedItem.login.password);
                break;
            case CipherType.Card:
                intent.putExtra('autofillFrameworkCardName', savedItem.card.name);
                intent.putExtra('autofillFrameworkCardNumber', savedItem.card.number);
                intent.putExtra('autofillFrameworkCardExpMonth', savedItem.card.expMonth);
                intent.putExtra('autofillFrameworkCardExpYear', savedItem.card.expYear);
                intent.putExtra('autofillFrameworkCardCode', savedItem.card.code);
                break;
            default:
                android.widget.Toast.makeText(this.getApplicationContext(), 'Unable to save this type of form.',
                    android.widget.Toast.LENGTH_SHORT).show();
                return;
        }
        this.startActivity(intent);
    }
}
