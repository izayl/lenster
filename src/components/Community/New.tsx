import { LensHubProxy } from '@abis/LensHubProxy';
import { useMutation } from '@apollo/client';
import { GridItemEight, GridItemFour, GridLayout } from '@components/GridLayout';
import ChooseFile from '@components/Shared/ChooseFile';
import Pending from '@components/Shared/Pending';
import SettingsHelper from '@components/Shared/SettingsHelper';
import { Button } from '@components/UI/Button';
import { Card } from '@components/UI/Card';
import { Form, useZodForm } from '@components/UI/Form';
import { Input } from '@components/UI/Input';
import { Spinner } from '@components/UI/Spinner';
import { TextArea } from '@components/UI/TextArea';
import useBroadcast from '@components/utils/hooks/useBroadcast';
import Seo from '@components/utils/Seo';
import { CreatePostBroadcastItemResult, Mutation } from '@generated/types';
import { CREATE_POST_TYPED_DATA_MUTATION } from '@gql/TypedAndDispatcherData/CreatePost';
import { PlusIcon } from '@heroicons/react/outline';
import getSignature from '@lib/getSignature';
import { Mixpanel } from '@lib/mixpanel';
import onError from '@lib/onError';
import splitSignature from '@lib/splitSignature';
import uploadMediaToIPFS from '@lib/uploadMediaToIPFS';
import uploadToArweave from '@lib/uploadToArweave';
import { NextPage } from 'next';
import React, { ChangeEvent, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { APP_NAME, LENSHUB_PROXY, RELAY_ON, SIGN_WALLET } from 'src/constants';
import Custom404 from 'src/pages/404';
import { useAppPersistStore, useAppStore } from 'src/store/app';
import { COMMUNITY, PAGEVIEW } from 'src/tracking';
import { v4 as uuid } from 'uuid';
import { useContractWrite, useSignTypedData } from 'wagmi';
import { object, string } from 'zod';

const newCommunitySchema = object({
  name: string()
    .min(2, { message: 'Name should be atleast 2 characters' })
    .max(31, { message: 'Name should be less than 32 characters' }),
  description: string().max(260, {
    message: 'Description should not exceed 260 characters'
  })
});

const NewCommunity: NextPage = () => {
  const userSigNonce = useAppStore((state) => state.userSigNonce);
  const setUserSigNonce = useAppStore((state) => state.setUserSigNonce);
  const currentProfile = useAppStore((state) => state.currentProfile);
  const isAuthenticated = useAppPersistStore((state) => state.isAuthenticated);
  const [avatar, setAvatar] = useState('');
  const [avatarType, setAvatarType] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { isLoading: signLoading, signTypedDataAsync } = useSignTypedData({ onError });

  useEffect(() => {
    Mixpanel.track(PAGEVIEW.CREATE_COMMUNITY);
  }, []);

  const onCompleted = () => {
    Mixpanel.track(COMMUNITY.NEW);
  };

  const {
    data,
    isLoading: writeLoading,
    write
  } = useContractWrite({
    addressOrName: LENSHUB_PROXY,
    contractInterface: LensHubProxy,
    functionName: 'postWithSig',
    mode: 'recklesslyUnprepared',
    onSuccess: onCompleted,
    onError
  });

  const form = useZodForm({
    schema: newCommunitySchema
  });

  const handleUpload = async (evt: ChangeEvent<HTMLInputElement>) => {
    evt.preventDefault();
    setUploading(true);
    try {
      const attachment = await uploadMediaToIPFS(evt.target.files);
      if (attachment[0]?.item) {
        setAvatar(attachment[0].item);
        setAvatarType(attachment[0].type);
      }
    } finally {
      setUploading(false);
    }
  };

  const { broadcast, data: broadcastData, loading: broadcastLoading } = useBroadcast({ onCompleted });
  const [createPostTypedData, { loading: typedDataLoading }] = useMutation<Mutation>(
    CREATE_POST_TYPED_DATA_MUTATION,
    {
      onCompleted: async ({
        createPostTypedData
      }: {
        createPostTypedData: CreatePostBroadcastItemResult;
      }) => {
        try {
          const { id, typedData } = createPostTypedData;
          const {
            profileId,
            contentURI,
            collectModule,
            collectModuleInitData,
            referenceModule,
            referenceModuleInitData,
            deadline
          } = typedData?.value;
          const signature = await signTypedDataAsync(getSignature(typedData));
          const { v, r, s } = splitSignature(signature);
          const sig = { v, r, s, deadline };
          const inputStruct = {
            profileId,
            contentURI,
            collectModule,
            collectModuleInitData,
            referenceModule,
            referenceModuleInitData,
            sig
          };

          setUserSigNonce(userSigNonce + 1);
          if (RELAY_ON) {
            const {
              data: { broadcast: result }
            } = await broadcast({ request: { id, signature } });

            if ('reason' in result) {
              write?.({ recklesslySetUnpreparedArgs: inputStruct });
            }
          } else {
            write?.({ recklesslySetUnpreparedArgs: inputStruct });
          }
        } catch {}
      },
      onError
    }
  );

  const createCommunity = async (name: string, description: string | null) => {
    if (!isAuthenticated) {
      return toast.error(SIGN_WALLET);
    }

    setIsUploading(true);
    const id = await uploadToArweave({
      version: '2.0.0',
      metadata_id: uuid(),
      description: description,
      content: description,
      external_url: null,
      image: avatar ? avatar : `https://avatar.tobi.sh/${uuid()}.png`,
      imageMimeType: avatarType,
      name: name,
      contentWarning: null, // TODO
      attributes: [
        {
          traitType: 'string',
          key: 'type',
          value: 'community'
        }
      ],
      media: [],
      locale: 'en',
      createdOn: new Date(),
      appId: `${APP_NAME} Community`
    }).finally(() => setIsUploading(false));

    createPostTypedData({
      variables: {
        options: { overrideSigNonce: userSigNonce },
        request: {
          profileId: currentProfile?.id,
          contentURI: `https://arweave.net/${id}`,
          collectModule: {
            freeCollectModule: {
              followerOnly: false
            }
          },
          referenceModule: {
            followerOnlyReferenceModule: false
          }
        }
      }
    });
  };

  if (!isAuthenticated) {
    return <Custom404 />;
  }

  return (
    <GridLayout>
      <Seo title={`Create Community • ${APP_NAME}`} />
      <GridItemFour>
        <SettingsHelper heading="Create community" description="Create new decentralized community" />
      </GridItemFour>
      <GridItemEight>
        <Card>
          {data?.hash ?? broadcastData?.broadcast?.txHash ? (
            <Pending
              txHash={data?.hash ? data?.hash : broadcastData?.broadcast?.txHash}
              indexing="Community creation in progress, please wait!"
              indexed="Community created successfully"
              type="community"
              urlPrefix="communities"
            />
          ) : (
            <Form
              form={form}
              className="p-5 space-y-4"
              onSubmit={({ name, description }) => {
                createCommunity(name, description);
              }}
            >
              <Input label="Name" type="text" placeholder="minecraft" {...form.register('name')} />
              <TextArea
                label="Description"
                placeholder="Tell us something about the community!"
                {...form.register('description')}
              />
              <div className="space-y-1.5">
                <div className="label">Avatar</div>
                <div className="space-y-3">
                  {avatar && (
                    <img
                      className="w-60 h-60 rounded-lg"
                      height={240}
                      width={240}
                      src={avatar}
                      alt={avatar}
                    />
                  )}
                  <div className="flex items-center space-x-3">
                    <ChooseFile onChange={(evt: ChangeEvent<HTMLInputElement>) => handleUpload(evt)} />
                    {uploading && <Spinner size="sm" />}
                  </div>
                </div>
              </div>
              <Button
                className="ml-auto"
                type="submit"
                disabled={typedDataLoading || isUploading || signLoading || writeLoading || broadcastLoading}
                icon={
                  typedDataLoading || isUploading || signLoading || writeLoading || broadcastLoading ? (
                    <Spinner size="xs" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )
                }
              >
                Create
              </Button>
            </Form>
          )}
        </Card>
      </GridItemEight>
    </GridLayout>
  );
};

export default NewCommunity;
